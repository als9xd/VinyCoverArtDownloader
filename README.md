# Description
Downloads all Vinyl Front Covert art from [covertartarchive](https://coverartarchive.org)

# Requirements
* Node.js
* Has been tested on Windows,Linux,and Mac

# How to use

## Windows,Linux,Max
1. Open base directory in cmd prompt
2. Install package dependencies using ```npm install```
3. Run ```node getCoverArt.js```
	* It is recommend that you increase the default maximum memory allocation for node. EX: ```node --max-old-space-size=4096 getCoverArt.js```

## Command Line Switches
```
usage: getCoverArt.js [-h] [-v] [-n NUM_PAGES] [-x PAGE_OFFSET]
                      [-o OUTPUT_DIRECTORY] [-s {large,small}]
                      [--no-fingerprint] [-d DATABASE_FILE] [--no-sql]


Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  -n NUM_PAGES, --num-pages NUM_PAGES
                        Max number of MusicBrainz release pages of retrieve
  -x PAGE_OFFSET, --page-offset PAGE_OFFSET
                        Initial page offset for MusicBrainz release pages
  -o OUTPUT_DIRECTORY, --output-directory OUTPUT_DIRECTORY
                        Directory to download cover art to
  -s {large,small}, --image-size {large,small}
                        Cover art image size (large=500,small=250,default=up
                        to 1200)
  --no-fingerprint      Disable image fingerprinting for testing
  -d DATABASE_FILE, --database-file DATABASE_FILE
                        Set a custom datatabase filepath
  --no-sql              Disable database for testing
```