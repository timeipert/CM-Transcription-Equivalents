const fs = require('fs');
async function test() {
  const url = 'https://digital.dombibliothek-koeln.de/hs/i3f/v20/263341/manifest';
  const res = await fetch(url);
  const data = await res.json();
  let folios = [];
  
  if (data['@context'] && data['@context'].includes('2/context.json')) {
      console.log('Detected IIIF v2');
      const canvases = data.sequences[0].canvases;
      for (const canvas of canvases) {
          const label = canvas.label;
          let imgUrl = null;
          if (canvas.images && canvas.images[0].resource) {
              const res = canvas.images[0].resource;
              if (res.service && res.service['@id']) {
                  imgUrl = res.service['@id'] + '/full/max/0/default.jpg';
              } else {
                  imgUrl = res['@id'];
              }
          }
          folios.push({ label, imgUrl });
      }
  } else if (data['@context'] && data['@context'].includes('3/context.json')) {
      console.log('Detected IIIF v3');
      // IIIF v3 logic here...
  }
  
  console.log('Parsed folios:', folios.length);
  console.log('First 3:', folios.slice(0,3));
}
test();
