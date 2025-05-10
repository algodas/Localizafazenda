// 🌍 Painel lateral com entrada de dados
var painel = ui.Panel({style: {width: '300px'}});
ui.root.insert(0, painel);
painel.add(ui.Label('📍 Parâmetros de Análise de Cacau e Água'));

// Modo satélite com rótulos
Map.setOptions('HYBRID');

var latInput = ui.Textbox({placeholder: 'Latitude', value: '-13.9290925'});
var lonInput = ui.Textbox({placeholder: 'Longitude', value: '-39.6195554'});
var raioInput = ui.Textbox({placeholder: 'Raio (km)', value: '10'});

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

// 📄 Variáveis globais para widgets de CSV
var csvTituloLabel = null;
var csvTextoLabel = null;

function gerarCSVcomoTexto(fc) {
  var csvHeader = 'latitude,longitude,tipo_origem\n';

  fc = fc.select(['latitude', 'longitude', 'tipo_origem']);
  fc.limit(500).evaluate(function(data) {
    var csv = csvHeader;
    data.features.forEach(function(f) {
      var p = f.properties;
      csv += p.latitude + ',' + p.longitude + ',' + p.tipo_origem + '\n';
    });

    if (csvTituloLabel) painel.remove(csvTituloLabel);
    if (csvTextoLabel) painel.remove(csvTextoLabel);

    csvTituloLabel = ui.Label('📄 Copie as linhas a seguir e salve em um arquivo .CSV:', {
      fontWeight: 'bold'
    });

    csvTextoLabel = ui.Label(csv, {
      whiteSpace: 'pre-wrap',
      fontSize: '10px',
      padding: '8px',
      border: '1px solid #ccc',
      backgroundColor: '#f7f7f7',
      width: '100%'
    });

    painel.add(csvTituloLabel);
    painel.add(csvTextoLabel);
  });
}
