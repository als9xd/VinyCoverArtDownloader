"use strict"

const ArgumentParser = require('argparse').ArgumentParser;
const parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
});

parser.addArgument(
  ['-f','--image-file'],
  {
    action: 'store',
    help: 'Max number of MusicBrainz release pages of retrieve',
    type: 'string',
    required: true
  }
);

const args = parser.parseArgs();

var pHash = require("node-phash");

const sqlite3 = require('sqlite3');
let db = new sqlite3.Database('data.db');

pHash.imageHash(args['image_file'],function(err,imageHash){
  if(err) throw err;

  db.all("SELECT * FROM releases",function(err,rows){
    if(err) throw err;
    for(let i = 0; i < rows.length;i++){
      rows[i].hammingDistance = pHash.hammingDistance(imageHash, rows[i].imageHash);      
    }
    rows.sort(function(a,b){
      return b.hammingDistance - a.hammingDistance;
    }).forEach(function(row){
      console.log(`
MBID             : ${row.mbid}
Filename         : ${row.fileName}
Hamming Distance : ${row.hammingDistance}
      `);
    });
  });
});