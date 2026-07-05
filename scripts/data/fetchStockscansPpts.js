const fs = require('fs');
const path = require('path');
const https = require('https');

// Create downloads directory if it doesn't exist
const outputDir = path.join(__dirname, '../downloads/stockscans-ppts');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Custom simple GET request handler using native https (to avoid needing axios if not available in this scope)
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 303) {
        // Handle redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  console.log('Fetching root folder...');
  const rootUrl = 'https://www.stockscans.in/drive-folder-proxy?folderId=1eaCLucSjMY895w4ngLzUxDXnafbIA1Jw';
  
  try {
    const rootData = await fetchJson(rootUrl);
    const folders = rootData.items.filter(item => item.isFolder);
    console.log(`Found ${folders.length} folders.`);

    // For brevity in testing, let's just do the first 2 folders if there are many, or we can do all.
    // Given the task, let's fetch all file metadata first.
    let allPdfs = [];
    
    for (const folder of folders) {
      console.log(`Fetching files for folder: ${folder.name} (${folder.id})`);
      const folderUrl = `https://www.stockscans.in/drive-folder-proxy?folderId=${folder.id}`;
      const folderData = await fetchJson(folderUrl);
      const files = folderData.items.filter(item => !item.isFolder && item.name.toLowerCase().endsWith('.pdf'));
      
      for (const file of files) {
        allPdfs.push({
          folderName: folder.name,
          fileName: file.name,
          fileId: file.id
        });
      }
    }
    
    console.log(`Found ${allPdfs.length} PDFs total.`);
    
    // Download first 3 for testing insights extraction without taking hours.
    // We can scale up later.
    const toDownload = allPdfs.slice(0, 3); 
    
    for (const pdf of toDownload) {
      const destPath = path.join(outputDir, pdf.fileName);
      if (!fs.existsSync(destPath)) {
        console.log(`Downloading ${pdf.fileName}...`);
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${pdf.fileId}`;
        await downloadFile(downloadUrl, destPath);
        console.log(`Downloaded to ${destPath}`);
      } else {
        console.log(`Already exists: ${pdf.fileName}`);
      }
    }
    
    console.log('Finished downloading selected PDFs.');
    
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

run();
