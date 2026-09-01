@echo off
rem ===================================================================
rem  Запуск игры на стенде: поднимает локальный сервер и открывает
rem  Chrome в режиме киоска (на весь экран, без адресной строки).
rem
rem  Просто дважды кликнуть по этому файлу.
rem  Выход из киоска: Alt+F4. Сервер закрывается вместе со своим окном.
rem
rem  ВАЖНО: файл сохранён в кодировке cp866 - именно её ждёт cmd.exe.
rem  Если открыть его в редакторе и сохранить как UTF-8, кириллица
rem  превратится в мусор и скрипт перестанет работать.
rem ===================================================================

cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] Python не найден в PATH.
    echo      Переустановите Python и отметьте "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

rem В выводе netstat номер порта стоит ДО слова LISTENING.
netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
    echo  [*] Запускаю локальный сервер на порту 8000...
    start "IB Fighter server" /min cmd /c "python -m http.server 8000"
    rem ping вместо timeout: timeout падает, если у окна перенаправлен ввод
    ping -n 3 127.0.0.1 >nul
) else (
    echo  [*] Порт 8000 уже занят - считаю, что сервер запущен.
)

set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
    echo.
    echo  [!] Chrome и Edge не найдены.
    echo      Откройте вручную: http://localhost:8000/
    echo.
    pause
    exit /b 1
)

echo  [*] Открываю игру...

rem Отдельный профиль в TEMP: стенд не тащит чужие закладки, историю
rem и вопрос "восстановить вкладки?" после выключения питания.
start "" "%BROWSER%" --kiosk --user-data-dir="%TEMP%\ib-fighter-kiosk" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-infobars --overscroll-history-navigation=0 "http://localhost:8000/"

exit /b 0
