const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/GROQ_API_KEY=["']?([^"'\r\n]+)["']?/);
if (match) {
  fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: 'Bearer ' + match[1].trim() },
  })
    .then((r) => r.json())
    .then((d) => {
      if (d.data) {
        console.log(d.data.map((m) => m.id).join(', '));
      } else {
        console.log('Error:', d);
      }
    });
}
