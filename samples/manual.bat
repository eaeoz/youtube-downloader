@echo off
setlocal enabledelayedexpansion

rem Prompt the user to choose between video or audio
set /p "mediaType=Do you want to download a video or audio (v/a)? "

rem Check if the user input is empty
if "%mediaType%"=="" (
    echo No selection provided. Exiting...
    exit /b
)

rem Prompt the user for the YouTube URL
set /p "userURL=Enter the YouTube URL: "

rem Check if the user input is empty
if "%userURL%"=="" (
    echo No URL provided. Exiting...
    exit /b
)

rem Use the --list-formats option to get the available formats
yt-dlp.exe --list-formats "!userURL!"

if /i "%mediaType%"=="v" (
    rem Video selected
    rem Prompt the user to enter the desired format code
    set /p "formatCode=Enter the format code (or press Enter to use bestvideo+bestaudio): "

    rem Initialize the command variable with the yt-dlp command for video
    if "!formatCode!"=="" (
        set "command=yt-dlp.exe -f "bestvideo[height<=1080]+bestaudio" --merge-output-format mp4 "!userURL!""
    ) else (
        rem Check if the format code contains a plus sign
        echo !formatCode! | findstr "+" >nul
        if !errorlevel! == 0 (
            rem Format code includes both video and audio
            set "command=yt-dlp.exe -f "!formatCode!" "!userURL!""
        ) else (
            rem Assume the user selected a video format only, merge with best audio
            set "command=yt-dlp.exe -f "!formatCode!+bestaudio" --merge-output-format mp4 "!userURL!""
        )
    )
) else if /i "%mediaType%"=="a" (
    rem Audio selected
    set "command=yt-dlp.exe -x --audio-format mp3 "!userURL!""
) else (
    echo Invalid selection. Please enter 'v' for video or 'a' for audio.
    exit /b
)

rem Execute the command
!command!
