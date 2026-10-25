const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find the template file in templates directory
const dir = fs.readdirSync('.').find(d => fs.statSync(d).isDirectory() && fs.readdirSync(d).some(f => f.includes('PPT(2)')));
const templateDir = dir;
const templateFile = fs.readdirSync(templateDir).find(f => f.includes('PPT(2)'));
const fullPath = path.resolve(templateDir, templateFile);
console.log('Template path:', fullPath);

// Copy to ascii temp path
fs.copyFileSync(fullPath, 'tools/temp_template2.jpg');
console.log('Copied to tools/temp_template2.jpg');

const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${path.resolve('tools/temp_template2.jpg').replace(/\\/g, '\\\\')}')
Write-Host "Original: $($img.Width)x$($img.Height)"
$cropRect = New-Object System.Drawing.Rectangle(0, 700, 2200, 1550)
$bmp = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropRect.Width, $cropRect.Height)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()
$bmp.Save('${path.resolve('tools/crop_template2_photos.jpg').replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Success cropping!"
`;
fs.writeFileSync('tools/run_crop.ps1', ps);
console.log(execSync('powershell -ExecutionPolicy Bypass -File tools/run_crop.ps1').toString());
