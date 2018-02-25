/*
app.js
Description: 
DTX Image Chart Batch Service
Objective(s):
Provide DTX Chart creator a way to batch create chart images for multiple .dtx files at once 

Ideas for Feature(s):
1. To support a standard song folder structure of multiple .dtx with a set.def within the folder. App parse set.def to find which .dtx to create chart images of
2. Support standard difficulty names (Basic, Advanced, Extreme, Master, Others) and draw them on chart images
3. User can upload multiple songs .dtx-es by zipping multiple song folders and upload the zip
4. After generation, user get back a zip containing:
a) .png chart images for each .dtx with difficulty label as defined in set.def
b) chart images are organized into song folders
c) A simple HTML index.html showing a table with links to the chart images (similar to XGPager)

Required external modules:
fabric for node
-->Requires node-canvas and its dependencies, which include native modules
fileHound
objectHash
ejs

Internal modules:
path
fs

Future required modules:
unzip
*/