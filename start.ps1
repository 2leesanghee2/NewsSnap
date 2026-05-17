# NewsSnap 전체 실행 스크립트
# 사용법: PowerShell에서 .\start.ps1

Write-Host "[1/3] Python 요약 서버 시작 (port 8000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "cd '$PSScriptRoot\summarizer'; python -X utf8 -m uvicorn api:app --host 0.0.0.0 --port 8000"

Start-Sleep -Seconds 3

Write-Host "[2/3] NewsSnap 서버 시작 (port 4000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "cd '$PSScriptRoot\server'; npm run dev"

Start-Sleep -Seconds 2

Write-Host "[3/3] NewsSnap 클라이언트 시작 (port 5173)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "cd '$PSScriptRoot\client'; npm run dev"

Write-Host ""
Write-Host "✅ 전체 실행 완료"
Write-Host "   Python API  → http://localhost:8000"
Write-Host "   서버        → http://localhost:4000"
Write-Host "   클라이언트  → http://localhost:5173"
