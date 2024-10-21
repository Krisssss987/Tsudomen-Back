const express = require('express');
const router = require('./routes');

const app = express();
app.use(express.json());
app.use(router);

app.get('/', (req, res) => {
  console.log('GET request received!');
  res.send('Server is running');
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
