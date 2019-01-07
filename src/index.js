#!/usr/bin/env node

const fs = require('fs');
const { join, extname, dirname } = require('path');
const { promisify } = require('util');
const recast = require('recast');
const parser = require('recast/parsers/acorn');

const args = require('args').option(
  'uri',
  `The URI of the browser reachable directory the scripts will be served from.
The relevant filename will be added to load the correct version (production.min or development).
Examples: https://localhost:3000/static/ or /vendor/ or https://www.my-site.com/static/vendor/`,
  './'
);
const flags = args.parse(process.argv);

const walk = require('./walk');

const read = promisify(fs.readFile);
const readDirectory = promisify(fs.readdir);
const write = promisify(fs.writeFile);

const baseDirectory = [__dirname];
const transformersDirectory = baseDirectory.concat('transformers');
const targetsDirectory = baseDirectory.concat('targets');
const joiner = p => join.apply(null, p);

const shouldWriteLibrariesToDisk = require.main === module;
const exportedProperties = {
  react: Object.keys(require('react')),
  'react-dom': Object.keys(require('react-dom'))
};

// assuming the verions of react and react-dom stay the same we get the version from the package.json
const version = process.env.npm_package_dependencies_react.replace(/[\^><=~]/g, '');

function getModuleStrings(importSourceUri = flags.uri) {
  return readDirectory(joiner(transformersDirectory))
    .then(filenames =>
      Promise.all(
        filenames.map(filename => {
          const {
            targetSelectSteps,
            sourceModule,
            sourceFile,
            sourceSelectSteps,
            argumentSelectSteps,
            targetArgumentSelectSteps,
            importSelectSteps,
            importFilename
          } = require(joiner(transformersDirectory.concat(filename)));

          const resolvedSourceFile = joiner(
            [dirname(require.resolve(sourceModule))].concat(sourceFile)
          );

          return read(joiner(targetsDirectory.concat(filename)), 'utf8').then(targetContent => {

            targetContent = targetContent
              .replace(/@@exports@@/g, exportedProperties[sourceModule].join(','))
              .replace(/@@version@@/g, version);

            const targtetAst = recast.parse(targetContent, { parser });

            return read(resolvedSourceFile)
              .then(sourceContent => {
                const newFilename = filename.replace(extname(filename), '.mjs');

                const sourceAst = recast.parse(sourceContent, { parser });

                // reference the part in the source AST we want to use
                const body = walk(sourceAst.program, sourceSelectSteps);


                // select the part we want to replace in the target with the part of the source AST
                walk(targtetAst.program, targetSelectSteps).body = body;

                // replace the argument to functionExpression when we need to
                if (argumentSelectSteps && targetArgumentSelectSteps) {
                  const arg = walk(sourceAst.program, argumentSelectSteps);
                  walk(targtetAst.program, targetArgumentSelectSteps).push(arg);
                }

                if (importSourceUri && importSelectSteps && importFilename) {
                  const finalImpoprtSourceUri = `${importSourceUri}${importFilename}`;
                  walk(targtetAst.program, importSelectSteps).value = finalImpoprtSourceUri;
                  console.log(
                    `replaced import source in ${newFilename} to ${finalImpoprtSourceUri}`
                  );
                }

                const generated = recast.print(targtetAst, { parser }).code;

                return {
                  filename: newFilename,
                  content: generated
                };
              })
              .catch(err => {
                console.error(err);
              });
          });
        })
      )
    )
    .then(generated =>
      generated.reduce(
        (prev, { filename, content }) => Object.assign(prev, { [filename]: content }),
        {}
      )
    )
    .catch(console.error);
}

if (shouldWriteLibrariesToDisk) {
  getModuleStrings().then(generated =>
    Object.keys(generated).map(filename =>
      write(join(__dirname, '..', filename), generated[filename], 'utf8').then(() =>
        console.log(`written /${filename}`)
      )
    )
  );
}

// export the function to enable external scripts to call this module and get an object returned with the ECMAScript modules as strings
module.exports = function(uri) {
  return getModuleStrings(uri);
};
