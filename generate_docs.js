#!/usr/bin/env node

/**
 * Script to generate the documentation based in JSDoc Annotations
 *
 * @example ./tasks/generate_docs.js
 *
 * @name       {generate_docs}
 */

const path = require('path'),
    documentation = require('documentation'),
    Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs'));

/**
 * Cotains type definitions and where should their link point to
 *
 * @type       {Object}
 */
const paths = require('param-links');

// Build Documentation
documentation
    .build(['index.js'], {
        shallow: true,
        hljs: {
            highlightAuto: true,
            languages: ['js', 'json', 'sql', 'sh', 'bash']
        }
    })
    .then(res => {
        return documentation.formats.md(res, {
            paths,
            hljs: {
                highlightAuto: true,
                languages: ['js', 'json', 'sql', 'sh', 'bash']
            }
        });
    })
    .then(output => {
        output = output.replace(/\n(#+)\s/g, '___\n$1 ');
        return fs.writeFileAsync(`${__dirname}/API.md`, output);
    })
    .catch(function(err) {
        console.warn('error when parsing file');
        console.error(err);
        return;
    });
