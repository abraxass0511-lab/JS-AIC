const fs = require('fs');

// We have tools/inspect_photo2_bottom.jpg
// Let's use powershell via a clean script file without inline escaping issues:
const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile("tools\\\\inspect_photo2_bottom.jpg")
Write-Host "Dim: $($bmp.Width)x$($bmp.Height)"
for ($y = 0; $y -lt $bmp.Height; $y += 20) {
    $c = $bmp.GetPixel(500, $y)
    Write-Host "y=$y (orig Y=$($y + 1250)): R=$($c.R) G=$($c.G) B=$($c.B)"
}
$bmp.Dispose()
`;
fs.writeFileSync('tools/scan.ps1', ps);
const { execSync } = require('child_process');
console.log(execSync('powershell -ExecutionPolicy Bypass -File tools/scan.ps1').toString());
