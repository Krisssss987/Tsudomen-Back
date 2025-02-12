const express = require('express');
const cors = require('cors');
const router = require('./new_routes');
const bodyParser = require('body-parser');

const app = express();
const port = 4500;

app.use(cors());

app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(router);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});