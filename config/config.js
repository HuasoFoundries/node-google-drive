const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname + '/../.env'),
  silent: false
});

const env = process.env; // eslint-disable-line no-process-env

const Config = {
  GOOGLE_DRIVE_ROOT_FOLDER: env.GOOGLE_DRIVE_ROOT_FOLDER,
  GOOGLE_DRIVE_KEY_FILE: env.GOOGLE_DRIVE_KEY_FILE,
  GOOGLE_CREDENTIALS: env.GOOGLE_CREDENTIALS
};

module.exports = Config;
