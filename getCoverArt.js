const ArgumentParser = require('argparse').ArgumentParser;
const parser = new ArgumentParser({
	version: '0.0.1',
	addHelp:true,
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


const args = parser.parseArgs();

const colors = require('colors/safe');

// https://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
const RateLimiter = require('limiter').RateLimiter;
const limiter = new RateLimiter(1, 'second');

function main(){
	const limit = 100;
	const musicBrainzBaseURL = 'https://musicbrainz.org/ws/2/release';
	const coverArtBaseURL = 'https://coverartarchive.org/release';

	getCount(`${musicBrainzBaseURL}?query=*&type=album&format=Vinyl&limit=1&offset=0`,function(count){
		let nPages =  (count/limit);
		if(args['num_pages']){
			nPages = args['num_pages'];
		}
		for(let cPage = 0;cPage < nPages; cPage++){
			limiter.removeTokens(1,function(){
				getReleaseList(`${musicBrainzBaseURL}?query=*&type=album&format=Vinyl&limit=${limit}&offset=${cPage*limit}`,function(releaseList){
					if(typeof releaseList !== 'undefined'){
						for(let rIndex = 0; rIndex < releaseList.length;rIndex++){
							let mbid = releaseList[rIndex]['$']['id'];
							getImageURL(`${coverArtBaseURL}/${mbid}`,function(imageURL){
								if(imageURL===null){
									console.log(colors.red(`Error: ${mbid} cover art not available`));
									return;
								}
								downloadImage(imageURL,args['output_directory'],function(filePath){
									console.log(colors.green(`Success: ${mbid} -> ${filePath}`));
								});
							});
						}
					}
				});
			});
		}
	});
}

function verifyPrereqs(){
	console.log(colors.yellow('Checking Preqreqs'));
	return [
		// Increase max tcp connections on windows
		new Promise(function(resolve,reject){
			switch (process.platform){
				case 'win32':
					const helpURL = colors.cyan("https://support.microsoft.com/en-us/help/196271/when-you-try-to-connect-from-tcp-ports-greater-than-5000-you-receive-t");
					const defaultMaxTCP = 5000;

					function warningMessage(numTCP){
						return `\nWarning: Max number of allowed tcp connections is ${numTCP}. This may or may not cause issues. If you start receiving errors rerun this script with admin priveleges or follow the steps outlined here:\n\n\t\t${helpURL}\n`;
					}


					const regedit = require('regedit');
					const keyPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters';
					const valueName = 'MaxUserPort';
					const valueData = 65534;
					regedit.list(keyPath, function (err, result) {
						if(typeof result[keyPath].values[valueName] !== 'undefined'){
							if(result[keyPath].values[valueName].value !== valueData){
								isAdmin().then(admin => {
									if(admin){
										console.log(colors.yellow('Attempting to modifying registry to allow for a larger number of tcp connections'));
										regedit.putValue({
											'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters': {
												'MaxUserPort': {
													value: 65534,
													type: 'REG_DWORD'
												}
											}
										}, function (err) {
											if(err){
												throw err;
											}
											reject('Restart PC to apply changes');
											return;
										});
									}else{
										console.log(colors.yellow(warningMessage(result[keyPath].values[valueName].value)));
										resolve();
										return;
									}
								});

							}else{
								console.log(colors.yellow(warningMessage(result[keyPath].values[valueName].value)));
								resolve();
								return;
							}
						}else{
							console.log(colors.yellow(warningMessage(defaultMaxTCP)));
							resolve();
						}
					});
					break;

					default:
					resolve();
			}
		}),
		new Promise(function(resolve,reject	){
			const heap_size_limit = require('v8').getHeapStatistics()['heap_size_limit'];
			let b2gb = 1e9;
			// GB
			let maxMemoryAllocation = Math.round(heap_size_limit/b2gb * 100) / 100;
			if(maxMemoryAllocation < 4.){
				console.log(colors.yellow(`
Warning: Max memory allocation set to ${maxMemoryAllocation}GB (Recommended 4GB).`));
				console.log(`
To increase allocation use the `+(colors.cyan('--max-old-space-size=X'))+` switch where X is the max number of MB to allocate.

Example:

		`+(colors.cyan(`node --max-old-space-size=4096 ${path.basename(__filename)}`))+`
				`);
			}
			resolve();
		})
	];
}

const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const request = require('request');
const parseString = require('xml2js').parseString;

const user_agent = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36';

const retryErrorCodes = {
	ETIMEDOUT : true,
	ECONNRESET: true,
	ENOTFOUND: true
};

function downloadImage(url,dir,callback){
	request(url,{
			rejectUnauthorized: false,
			encoding: 'binary'
		},
		function(err,res,body){
			if(err){
				if(retryErrorCodes[err.code] === true){
					console.log(colors.yellow(`Retry::downloadImage - ${err.toString()}`));
					downloadImage(url,dir,callback);
					return;
				}
				throw err;
			}

			let urlSplit = url.split('/');
			let fileName = urlSplit[urlSplit.length-1];
			let filePath = path.join(dir,fileName)

			fs.access(dir, fs.constants.F_OK, function(err){
				function _writeImageFile(){
					fs.writeFile(filePath,body,'binary',function(err){
						if(err) throw err;
						callback(filePath);
					});
				}

				if(err && err.code === 'ENOENT'){
					console.log(colors.yellow(`Attempting to build directory ${dir}`));
					mkdirp(dir,function(err){
						if(err) throw err;
						console.log(colors.green('Success'));
						_writeImageFile();
					});
				}else{
					_writeImageFile();
				}

			});
		}
	);
}

function getImageURL(url,callback){
	request(url,{
			rejectUnauthorized: false,
			json: true
		},
		function(err,res,body){
			if(err){
				if(retryErrorCodes[err.code] === true){
					console.log(colors.yellow(`Retry::getImageURL - ${err.toString()}`));
					getImageURL(url,callback);
					return;
				}
				throw err;
			}

			// Doesn't have cover art
			if(res.statusCode == 404){
				callback(null);
				return;
			}

			for(let i in body['images']){
				if(body['images'][i]['front'] === true){
					if(args['image_size']){
						callback(body['images'][i]['thumbnails'][args['image_size']]);
					}else{
						callback(body['images'][i]['image']);
					}
				}
			}
		}
	);
}

function getReleaseList(url,callback){
	request(url, {
		rejectUnauthorized: false,
		headers: {
			'User-Agent': user_agent
		},
		agent: false,
	},function(err,res,body){
		if(err){
			if(retryErrorCodes[err.code] === true){
				console.log(colors.yellow(`Retry::getReleaseList - ${err.toString()}`));
				getReleaseList(url,callback);
				return;
			}
			throw err;
		}

		// Rate limiting
		if(res.statusCode === 503){
			console.log(colors.cyan(`Retry::getReleaseList - Error: Rate Limiting`));
			getReleaseList(url,callback);
			return;
		}

		parseString(body,function (err, result) {
			if(err){
				throw err;
			}
			callback(result['metadata']['release-list'][0]['release']);
		});
	})
}

function getCount(url,callback){
	request(url, {
		rejectUnauthorized: false,
		headers: {
				'User-Agent': user_agent
			}
		},function(err,res,body){
			if(err){
				if(retryErrorCodes[err.code] === true){
					console.log(colors.yellow(`Retry::getCount - ${err.toString()}`));
					getCount(url,callback);
					return;
				}
				throw err;
			}

			parseString(body,function (err, result) {
				callback(result['metadata']['release-list'][0]['$']['count']);
			});
		}
	);
}

Promise.all(verifyPrereqs()).then(()=>{
	console.log(colors.green('Prereqs success'));
	main();
}).catch((err)=>{
	if(err){
		console.log(colors.red(err));
		process.exit(0);
	}
});
