// 🌍 Painel lateral com entrada de dados
var painel = ui.Panel({style: {width: '300px'}});
ui.root.insert(0, painel);
painel.add(ui.Label('📍 Parâmetros de Análise de Cacau e Água'));

Map.setOptions('HYBRID');

var defaultLat = -13.93075;
var defaultLon = -39.62432;
var defaultRaio = 10;

var latInput = ui.Textbox({placeholder: 'Latitude', value: defaultLat.toString()});
var lonInput = ui.Textbox({placeholder: 'Longitude', value: defaultLon.toString()});
var raioInput = ui.Textbox({placeholder: 'Raio (km)', value: defaultRaio.toString()});

painel.add(ui.Label('Latitude:'));
painel.add(latInput);
painel.add(ui.Label('Longitude:'));
painel.add(lonInput);
painel.add(ui.Label('Raio (km):'));
painel.add(raioInput);

var botao = ui.Button({
  label: '🔍 Executar Análise',
  onClick: function() {
    var lat = parseFloat(latInput.getValue());
    var lon = parseFloat(lonInput.getValue());
    var raio_km = parseFloat(raioInput.getValue());

    if (isNaN(lat) || isNaN(lon) || isNaN(raio_km)) {
      ui.alert('⚠️ Preencha todos os campos corretamente.');
      return;
    }

    executarAnalise(lat, lon, raio_km);
  }
});
painel.add(botao);

// Variáveis globais dos labels de CSV
var labelTitulo = null;
var labelCSV = null;

function gerarAreaInteresse(lat, lon, raio_km) {
  var centro = ee.Geometry.Point([lon, lat]);
  Map.centerObject(centro, 10);
  var area = centro.buffer(raio_km * 1000);
  Map.addLayer(area, {color: 'red'}, 'Área de Interesse');
  return area;
}

function executarAnalise(lat, lon, raio_km) {
  Map.clear();  // 🧹 Limpa camadas anteriores

  var areaInteresse = gerarAreaInteresse(lat, lon, raio_km);

  var s2 = ee.ImageCollection('COPERNICUS/S2_SR')
    .filterBounds(areaInteresse)
    .filterDate('2023-01-01', '2023-12-31')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(function(img) {
      var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
      var ndwi = img.normalizedDifference(['B3', 'B8']).rename('NDWI');
      var evi = img.expression(
        '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
        {'NIR': img.select('B8'), 'RED': img.select('B4'), 'BLUE': img.select('B2')}
      ).rename('EVI');
      return img.addBands([ndvi, ndwi, evi]);
    });

  var ndviMean = s2.select('NDVI').mean();
  var ndwiMean = s2.select('NDWI').mean();
  var eviMean = s2.select('EVI').mean();

  var preditores = ee.Image.cat([ndviMean, ndwiMean, eviMean])
    .clip(areaInteresse)
    .rename(['NDVI', 'NDWI', 'EVI']);

  var mapbiomas = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection9/mapbiomas_collection90_integration_v1')
    .select('classification_2023')
    .rename('classification')
    .clip(areaInteresse);

  var posSamples = mapbiomas.eq(3).selfMask().stratifiedSample({
    numPoints: 50, classBand: 'classification',
    region: areaInteresse, scale: 30,
    geometries: true, seed: 1
  }).map(function(f) { return f.set('classe', 1); });

  var negSamples = mapbiomas.eq(15).selfMask().stratifiedSample({
    numPoints: 50, classBand: 'classification',
    region: areaInteresse, scale: 30,
    geometries: true, seed: 2
  }).map(function(f) { return f.set('classe', 0); });

  var amostras = posSamples.merge(negSamples);
  Map.addLayer(amostras.filter(ee.Filter.eq('classe', 1)), {color: 'green'}, 'Amostras Cacau', false);

  var aguaNDWI = ndwiMean.gt(0.15);
  var jrc = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence');
  var aguaJRC = jrc.gt(10);
  var aguaCombinada = aguaNDWI.or(aguaJRC).selfMask();

  var regioesAgua = aguaCombinada.reduceToVectors({
    geometry: areaInteresse, geometryType: 'polygon',
    scale: 30, maxPixels: 1e13
  });

  var pontosAgua = regioesAgua.map(function(f) {
    return ee.Feature(f.geometry().centroid(10)).set({'tipo': 'agua'});
  });

  var buffersAgua = pontosAgua.map(function(pt) {
    return pt.buffer(2000);
  });

  var areaAguaExpandida = buffersAgua.union().geometry();

  var pontosVioletas = posSamples.filterBounds(areaAguaExpandida).map(function(f) {
    var coords = f.geometry().coordinates();
    return ee.Feature(f.geometry()).set({
      'latitude': coords.get(1),
      'longitude': coords.get(0),
      'tipo_origem': 'cacau_agua'
    });
  });

  Map.addLayer(aguaCombinada, {palette: ['lightblue']}, 'Máscara de Água');
  Map.addLayer(pontosAgua, {color: 'blue'}, 'Pontos de Água');
  Map.addLayer(pontosVioletas, {color: 'orange'}, '📍 Cacau ≤2km da Água');

  var csvHeader = 'latitude,longitude,tipo_origem\n';

  pontosVioletas.select(['latitude', 'longitude', 'tipo_origem'])
    .limit(500)
    .evaluate(function(data) {
      var csv = csvHeader;
      data.features.forEach(function(f) {
        var p = f.properties;
        csv += p.latitude + ',' + p.longitude + ',' + p.tipo_origem + '\n';
      });

      // ✅ Remove CSV anterior, se existir
      if (labelTitulo) painel.remove(labelTitulo);
      if (labelCSV) painel.remove(labelCSV);

      labelTitulo = ui.Label('📄 Coordenadas de pontos de cacau a até 2km da água (salve como .CSV):', {
        fontWeight: 'bold'
      });

      labelCSV = ui.Label(csv, {
        whiteSpace: 'pre-wrap',
        fontSize: '10px',
        padding: '8px',
        border: '1px solid #ccc',
        backgroundColor: '#f7f7f7',
        width: '100%'
      });

      painel.add(labelTitulo);
      painel.add(labelCSV);
    });

  Export.table.toDrive({
    collection: pontosAgua,
    description: 'Pontos_de_Agua_Centroides',
    fileFormat: 'CSV'
  });

  Export.table.toDrive({
    collection: pontosVioletas,
    description: 'Pontos_Cacau_Agua_Centroides',
    fileFormat: 'CSV'
  });
}

// 🚀 Executar ao carregar
executarAnalise(defaultLat, defaultLon, defaultRaio);
