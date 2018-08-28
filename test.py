# import the necessary packages
from skimage.measure import compare_ssim
import argparse
import imutils
import cv2

import os

import pprint
pp = pprint.PrettyPrinter(depth=6)

ap = argparse.ArgumentParser()

ap.add_argument("-f", "--first", required=True,
    help="first input image")

args = vars(ap.parse_args())

files = os.listdir("images")

results = {}

for file in files:

    # load the two input images
    imageA = cv2.imread(args["first"])
    imageB = cv2.imread("images\\"+file)

    resizeA = cv2.resize(imageA,(12,12))
    resizeB = cv2.resize(imageB,(12,12))

    # convert the images to grayscale
    grayA = cv2.cvtColor(resizeA, cv2.COLOR_BGR2GRAY)
    grayB = cv2.cvtColor(resizeB, cv2.COLOR_BGR2GRAY)


    (score, diff) = compare_ssim(grayA, grayB, full=True)
    diff = (diff * 255).astype("uint8")
    results[file] = score

pp.pprint(sorted(results.items(), key=lambda x: x[1]))