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
3. Run ```node getCoverArt.js```
	* It is recommend that you increase the default maximum memory alloction for node. EX: ```node --max-old-space-size=4096 getCoverArt.js```

## Command Line Switches
*  ```node getCoverArt.js -h,--help```
*  ```node getCoverArt.js -n,--num-pages X``` where X the max number of MusicBrainz release pages to retrieve (100 releases per page)
*  ```node getCoverArt.js -o,--output-directory X``` where X is the directory to store downloaded cover art
*  ```node getCoverArt.js -s,--image-size X``` where X is the image size (large=500,small=250,default=up to 1200).
