@echo off
setlocal enabledelayedexpansion

rem Prompt the user for the YouTube URL
set /p "userURL=Enter the YouTube URL: "

rem Initialize the command variable with the yt-dlp command
set "command=yt-dlp.exe -x --audio-format mp3"

rem Check if the user input is empty
if "%userURL%"=="" (
    echo No URL provided. Exiting...
    exit /b
)

rem Enclose the user URL in double quotes
set "command=!command! "!userURL!""

rem Execute the command
!command!