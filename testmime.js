const readChunk = require('read-chunk');
const fileType = require('file-type');
const buffer = readChunk.sync('./data/sample.jpg', 0, 4100);

console.log(fileType(buffer));
