@echo off
chcp 65001 > nul
cls
echo ========================================================
echo [SafePatrol] Cloudflare 24h Qwen AI Permanent Deploy
echo ========================================================
echo.
cd /d "c:\Users\YS\Desktop\안티그래피티\JS AIC\worker"
echo [1/2] Opening Cloudflare login in your browser...
echo (Please click 'Allow' in the browser window)
echo.
call npx wrangler login
if %ERRORLEVEL% equ 0 (
    echo.
    echo [2/2] Deploying Qwen Vision + Qwen3-30B v57 Worker to Cloudflare...
    call npx --yes wrangler@3 deploy --keep-vars
    echo.
    echo ========================================================
    echo [SUCCESS] Cloudflare 24h Qwen AI deployed successfully!
    echo ========================================================
) else (
    echo.
    echo [ERROR] Cloudflare login was cancelled or timed out.
)
echo.
pause
