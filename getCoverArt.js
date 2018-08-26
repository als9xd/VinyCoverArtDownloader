const ENV_CONFIG = {
	NODE_VCAD_MEM: {
		default: 4096,
		info: 'maximum memory allocation for node'
	}
};

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

const args = parser.parseArgs();

const colors = require('colors/safe');

const RateLimiter = require('limiter').RateLimiter;
// https://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
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
		new Promise(function(resolve,reject){
			if(process.platform === 'win32'){
				const helpURL = "https://support.microsoft.com/en-us/help/196271/when-you-try-to-connect-from-tcp-ports-greater-than-5000-you-receive-t";

				const regedit = require('regedit');
				const keyPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters';
				const valueName = 'MaxUserPort';
				const valueData = 65534;
				regedit.list(keyPath, function (err, result) {
					if((typeof result[keyPath].values[valueName] === 'undefined') || 
						(result[keyPath].values[valueName].value !== valueData)){
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
								if(err.toString() === 'Error: access is denied'){
									console.log(colors.red(`Please restart command prompt as admin or follow the steps outlined here:\n\n${helpURL}`));
									return;
								}
								throw err;
							}
							reject('Restart PC to apply changes');
						});
					}else{
						resolve();				
					}
				});
			}
		}),
		new Promise(function(resolve,reject){
			for(let v in ENV_CONFIG){
				if(typeof process.env[v] === 'undefined'){
					if(process.platform === 'win32'){
						reject(`
Error: Could not find environment setting "${v}" 

Run this command:

	"`+colors.cyan(`set ${v}=X`)+`" where `+colors.cyan('X')+` is the ${ENV_CONFIG[v].info} (Recommended default `+colors.cyan(`${ENV_CONFIG[v].default}`)+`)
`)
					}
				}				
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
					callback(body['images'][i]['image']);
				}
			}
		}
	);	
}

function getReleaseList(url,callback){
	request(url, {
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
	console.log(colors.green('Done'));	
	main();
}).catch((err)=>{
	if(err){
		console.log(colors.red(err));
		process.exit(0);	
	}
});