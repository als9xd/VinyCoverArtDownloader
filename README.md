# Description
Downloads all Vinyl Front Covert art from [covertartarchive](https://coverartarchive.org)

# Requirements 
* Node.js
* Only tested on windows
	- Requires Admin priveleges (at least once)

# How to use
## Windows
1. Open base directory in cmd prompt
2. Install package dependencies using ```npm install```
3. Run ```npm start```

## Command Line Switches
*  ```npm start -- --help```
*  ```npm start -- --n,--num-pages X``` where X the max number of MusicBrainz release pages to retrieve (100 releases per page)
*  ```npm start -- --o,--output-directory X``` where X is the directory to store downloaded cover art
