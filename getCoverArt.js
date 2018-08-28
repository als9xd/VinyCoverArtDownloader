'use strict'

const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const ArgumentParser = require('argparse').ArgumentParser;
const parser = new ArgumentParser({
	version: '0.0.1',
	addHelp: true,
});

parser.addArgument(
	['-n','--num-pages'],
	{
		action: 'store',
		help: 'Max number of MusicBrainz release pages of retrieve',
		type: 'int'
	}
);

parser.addArgument(
	['-x','--page-offset'],
	{
		action: 'store',
		help: 'Initial page offset for MusicBrainz release pages',
		type: 'int',
		defaultValue: 0
	}
);

parser.addArgument(
	['-o','--output-directory'],
	{
		action: 'store',
		help: 'Directory to download cover art to',
		type: 'string',
		defaultValue: 'images/'
	}
);

parser.addArgument(
	['-s','--image-size'],
	{
		action: 'store',
		help: 'Cover art image size (large=500,small=250,default=up to 1200)',
		type: 'string',
		choices: [
			'large',
			'small',
		],
	}
);

parser.addArgument(
	['--no-fingerprint'],
	{
		action: 'storeTrue',
		help: 'Disable image fingerprinting for testing'
	}
);

parser.addArgument(
	['-d','--database-file'],
	{
		action: 'store',
		help: 'Set a custom datatabase filepath',
		type: 'string',
		defaultValue: 'data.db'
	}
);

parser.addArgument(
	['--no-sql'],
	{
		action: 'storeTrue',
		help: 'Disable database for testing'
	}
);

const args = parser.parseArgs();

// Logging with Winston
const os = require('os')
const winston = require('winston')
const { createLogger, format, transports } = winston;
const { combine, timestamp, label, printf } = format;

const logDir = path.resolve(__dirname , 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir)
}

const loggerConfig = {
	levels: {
		error: 0,
		http: 1, 
		ratelimit: 2, 
		warn: 3, 
		success: 4, 
		info: 5, 
		verbose: 6, 
		debug: 7, 
		silly: 8 
	},
	colors: {
		error: 'red',
		http: 'cyan', 
		ratelimit: 'magenta', 
		warn: 'yellow',
		success: 'green', 
		info: 'gray', 
		verbose: 'blue', 
		debug: 'white', 
		silly: 'pink' 
	}
}

const logger = createLogger({
	levels: loggerConfig.levels,
  json: false,
  format: combine(
  	 winston.format.colorize(),
  ),
  transports: [
  	new winston.transports.Console({format: winston.format.simple()}),
    new transports.File({ filename: path.resolve(logDir, 'info.log'), level: 'info' }),
    new transports.File({ filename: path.resolve(logDir, 'error.log'), level: 'error' })
  ]
})
winston.addColors(loggerConfig.colors);

const timeSpan = require('time-span');

// https://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
const RateLimiter = require('limiter').RateLimiter;
const limiter = new RateLimiter(1, 'second');

function removeTokens(tokens){
	return new Promise((resolve)=>{
		limiter.removeTokens(tokens,resolve);
	});
}

const musicBrainzPageLimit = 100;
const musicBrainzBaseURL = 'https://musicbrainz.org/ws/2/release';
const coverArtBaseURL = 'https://coverartarchive.org/release';

function main(){
	let metrics = {
		'Total Downloaded'	  : 0,
		'New Cover Art'       : 0,
		'Cover Art Updated'   : 0,
		'Missing Cover Art'   : 0,
	};

	let db = args['no_sql'] ? null : new sqlite3.Database(args['database_file']);
	configureDb(db).then(dbQueries => {
		let end = timeSpan();
		let firstReleaseListURL = `${musicBrainzBaseURL}?query=*&type=album&format=Vinyl&limit=1&offset=0`;
		getReleaseCount(firstReleaseListURL).then(releaseCount => {
			let nPages =  (releaseCount/musicBrainzPageLimit);
			if(args['num_pages']){
				nPages = args['num_pages'];
			}
			let releaseListPageURLs = [];

			for(let cPage = args['page_offset'];cPage < nPages+args['page_offset']; cPage++){
				releaseListPageURLs.push(`${musicBrainzBaseURL}?query=*&type=album&format=Vinyl&limit=${musicBrainzPageLimit}&offset=${cPage*musicBrainzPageLimit}`);
			}
			let releaseListPromises = releaseListPageURLs.map(releaseListPageURL => {
				return removeTokens(1).then(()=>{
					return getReleases(releaseListPageURL).then(releases => {
						let caaReleasePagePromises = Object.keys(releases).map(caaReleasePageURL => {
							let releaseMBID = releases[caaReleasePageURL];
							return getCaaImageURLs(caaReleasePageURL).then(caaImageURLs => {
								process.stdout.write(`\rSpeed ${Math.round((metrics['Total Downloaded']/end())*1000 * 100) / 100} images/second : Images Checked ${metrics['Total Downloaded']}/${releaseCount} : ETIMEDOUT ${retryErrorsHit['ETIMEDOUT']} | ECONNRESET ${retryErrorsHit['ECONNRESET']} | ENOTFOUND ${retryErrorsHit['ENOTFOUND']} | ECONNREFUSED ${retryErrorsHit['ECONNREFUSED']}`);
								if(caaImageURLs===null){
									//logger.error(`${releaseMBID} : Cover art not available`);
									metrics['Missing Cover Art']++;
									return;
								}
								let caaImagePromises = caaImageURLs.map(caaImageURL => {
									return downloadImage(caaImageURL,args['output_directory']).then(filePath => {
										//logger.success(`${releaseMBID} : Downloaded to ${filePath} : images/sec`);
										metrics['Total Downloaded']++;
										return new Promise((resolve,reject) => {
											if(args['no_sql']) resolve();
											dbQueries['exists'].all([releaseMBID],(err,rows) => {
												if(err) reject(err);
												if(rows && rows.length){
													dbQueries['update'].run([path.basename(filePath),releaseMBID],err => {
														if(err) reject(err);
														metrics['Cover Art Updated']++;
														resolve();
													});
												}else{
													dbQueries['insert'].run([releaseMBID,path.basename(filePath)],err => {
														if(err) reject(err);
														metrics['New Cover Art']++;
														resolve();
													});
												}
											});
										}).catch(err => {
											throw err;
										});
									}).catch(err => {
										throw err;
									});
								});						
								return Promise.all(caaImagePromises);
							}).catch(err => {
								throw err;
							});
						});
						return Promise.all(caaReleasePagePromises);
					}).catch(err => {
						throw err;
					});
				}).catch(err => {
					throw err;
				});
			});
			return Promise.all(releaseListPromises).then(()=>{
				cleanupDb(db,dbQueries).then(()=>{
					logger.info(`\n${metrics}`);
				}).catch(err => {
					throw err;
				});
			});
		}).catch(err => {
			throw err;
		});
	}).catch(err => {
		throw err;
	});		
}


const dbSchema = `
CREATE TABLE IF NOT EXISTS releases(
	mbid STRING PRIMARY KEY,
	fileName INT NOT NULL
)
`;

const dbQueryStrings = {
	insert: 'INSERT INTO releases (mbid,filename) VALUES (?,?)',
	exists: 'SELECT 1 FROM releases WHERE mbid = ? LIMIT 1',
	update: 'UPDATE releases SET filename = ? WHERE mbid = ?'
}

function configureDb(db){
	if(args['no_sql']) return Promise.resolve();

	return new Promise((resolve,reject) => {
		db.run(dbSchema,err => {
			if(err) reject(err);
			let dbQueries = {};
			for(let q in dbQueryStrings){
				dbQueries[q] = db.prepare(dbQueryStrings[q]);
			}
			resolve(dbQueries);
		});
	});
}

function cleanupDb(db,dbQueries){
	if(args['no_sql']) return Promise.resolve();

	return new Promise((resolve,reject) => {
		for(let q in dbQueries){
			dbQueries[q].finalize();
		}
		db.close();
		resolve();		
	});
}

function verifyPrereqs(){
	logger.info('Checking Preqreqs\n');
	return [
		// Increase max tcp connections on windows
		new Promise((resolve,reject) => {
			switch (process.platform){
				case 'win32':
					const helpURL = "https://support.microsoft.com/en-us/help/196271/when-you-try-to-connect-from-tcp-ports-greater-than-5000-you-receive-t";
					const defaultMaxTCP = 5000;

					function warningMessage(numTCP){
						return `Max number of allowed tcp connections is ${numTCP}. This may or may not cause issues. If you start receiving errors rerun this script with admin priveleges or follow the steps outlined here:\n\n${helpURL}\n`;
					}

					const regedit = require('regedit');
					const keyPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters';
					const valueName = 'MaxUserPort';
					const valueData = 65534;
					regedit.list(keyPath,(err, result) => {
						if(typeof result[keyPath].values[valueName] !== 'undefined'){
							if(result[keyPath].values[valueName].value !== valueData){
								isAdmin().then(admin => {
									if(admin){
										logger.warn('Attempting to modifying registry to allow for a larger number of tcp connections');
										regedit.putValue({
											'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters': {
												'MaxUserPort': {
													value: 65534,
													type: 'REG_DWORD'
												}
											}
										},err => {
											if(err) throw err;
											reject('Restart PC to apply changes');
											return;
										});
									}else{
										logger.warn(warningMessage(result[keyPath].values[valueName].value));
										resolve();
										return;
									}
								});

							}else{
								logger.warn(warningMessage(result[keyPath].values[valueName].value));
								resolve();
								return;
							}
						}else{
							logger.warn(warningMessage(defaultMaxTCP));
							resolve();
						}
					});
					break;

					default:
					resolve();
			}
		}),
		// Check Node Maximum heap size
		new Promise((resolve,reject) => {
			const heap_size_limit = require('v8').getHeapStatistics()['heap_size_limit'];
			let b2gb = 1e9;
			// GB
			let maxMemoryAllocation = Math.round(heap_size_limit/b2gb * 100) / 100;
			if(maxMemoryAllocation < 4.){
				logger.warn(`Max heap allocation set to ${maxMemoryAllocation}GB (Recommended 4GB). To increase maximum heap size use the '--max-old-space-size=X' switch where X is the max number of MB to allocate. Example:\n\n\"node --max-old-space-size=4096 ${path.basename(__filename)}\"\n`);
			}
			resolve();
		})
	];
}

const sqlite3 = require('sqlite3');

const request = require('request');
const parseString = require('xml2js').parseString;

const user_agent = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36';

const retryErrorCodes = {
	ETIMEDOUT : true,
	ECONNRESET: true,
	ENOTFOUND: true,
	ENETUNREACH: true,
	ECONNREFUSED: true
};

let retryErrorsHit = Object.assign({},retryErrorCodes);
Object.keys(retryErrorsHit).forEach((key) => {
	retryErrorsHit[key] = 0;
});


function downloadImage(imageURL,dir){
	return new Promise((resolve,reject) => {
		request(imageURL,{
				rejectUnauthorized: false,
				encoding: 'binary'
			},
			(err,res,body) => {
				if(err){
					if(retryErrorCodes[err.code] === true){
						retryErrorsHit[err.code]++;
						//logger.http(`Retry::downloadImage - ${err.toString()}`);
						return downloadImage(imageURL,dir);
					}
					reject(err);
				}

				let urlSplit = imageURL.split('/');
				let fileName = urlSplit[urlSplit.length-1];
				let filePath = path.join(dir,fileName)

				fs.access(dir, fs.constants.F_OK,err => {
					if(err) reject(err);
					function _writeImageFile(){
						fs.writeFile(filePath,body,'binary',err => {
							if(err) reject(err);
							resolve(filePath);
						});
					}

					if(err && err.code === 'ENOENT'){
						logger.warn(`Building a new directory at \"${dir}\"`);
						mkdirp(dir,err => {
							if(err) reject(err);
							_writeImageFile();
						});
					}else{
						_writeImageFile();
					}

				});
			}
		)
	});
}

function getCaaImageURLs(caaReleaseURL){
	return new Promise((resolve,reject) => {
		request(caaReleaseURL,
			{
				rejectUnauthorized: false,
				json: true,
			},(err,res,body) => {
				if(err){
					if(retryErrorCodes[err.code] === true){
						retryErrorsHit[err.code]++;
						//logger.http(`Retry::getCaaImageURLs - ${err.toString()}`);
						return getCaaImageURLs(caaReleaseURL);
					}
					reject(err);					
				}

				// Doesn't have cover art
				if(res.statusCode == 404){
					resolve(null);
					return;
				}

				let imageURLs = [];
				let imageObjs = res.body['images'];
				if(typeof imageObjs !== 'undefined'){
					for(let i = 0; i < imageObjs.length;i++){
						if(imageObjs[i]['front'] === true){
							if(args['image_size']){
								imageURLs.push(imageObjs[i]['thumbnails'][args['image_size']]);
							}else{
								imageURLs.push(imageObjs[i]['image']);
							}
						}
					};					
				}
				resolve(imageURLs);
			}
		);
	});
}

function getReleases(releaseListURL){
	return new Promise((resolve,reject) => {
		request(releaseListURL,
			{
				rejectUnauthorized: false,
				headers: {
					'User-Agent': user_agent
				},
				agent: false,
			},(err,res,body) => {
				if(err){
					if(retryErrorCodes[err.code] === true){
						retryErrorsHit[err.code]++;
		
						//logger.http(`Retry::getReleaseList - ${err.toString()}`);
						return getReleases(releaseListURL);	
					}
					reject(err);						
				}

				// Rate limiting
				if(res.statusCode === 503){
					//logger.ratelimit(`Retry::getReleaseList - Rate Limiting`);
					rateLimitsHit++;
					return getReleases(url);
				}		
				parseString(body,(err, result) => {
					if(err) reject(err);

					let releases = [];
					let releaseList = result['metadata']['release-list'][0]['release'];
					if(typeof releaseList !== 'undefined'){
						for(let rIndex = 0; rIndex < releaseList.length;rIndex++){
							let mbid = releaseList[rIndex]['$']['id'];
							let coverArtUrl = `${coverArtBaseURL}/${mbid}`;
							releases[coverArtUrl] = mbid;
						}
						resolve(releases);						
					}
				});			
			}
		);
	});
}

function getReleaseCount(firstReleaseListURL){
	return new Promise((resolve,reject) => {
		request(firstReleaseListURL,
			{
				rejectUnauthorized: false,
				headers: {
					'User-Agent': user_agent
				},
				agent: false,
			},(err,res,body) => {
				if(err){
					if(retryErrorCodes[err.code] === true){
						retryErrorsHit[err.code]++;
						//logger.http(`Retry::getReleaseCount - ${err.toString()}`);
						return getReleaseCount(firstReleaseListURL,callback);
					}
					reject(err);
				}

				parseString(body,(err,result) => {
					resolve(result['metadata']['release-list'][0]['$']['count']);
				});

			}
		)
	});
}

Promise.all(verifyPrereqs()).then(() => {
	logger.info('Starting...\n');
	main();
}).catch(err =>{
	if(err) throw err;
});
