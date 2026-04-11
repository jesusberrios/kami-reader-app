
██╗  ██╗ █████╗ ███╗   ███╗██╗    ██████╗ ███████╗ █████╗ ██████╗ ███████╗██████╗ 
██║ ██╔╝██╔══██╗████╗ ████║██║    ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗
█████╔╝ ███████║██╔████╔██║██║    ██████╔╝█████╗  ███████║██║  ██║█████╗  ██████╔╝
██╔═██╗ ██╔══██║██║╚██╔╝██║██║    ██╔══██╗██╔══╝  ██╔══██║██║  ██║██╔══╝  ██╔══██╗
██║  ██╗██║  ██║██║ ╚═╝ ██║██║    ██║  ██║███████╗██║  ██║██████╔╝███████╗██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝    ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝

  Tu lector de manga favorito • v1.1.5 • Android

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📥  DESCARGAR APK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Descarga directa (última versión):
  https://github.com/jesusberrios/kami-reader-app/releases/download/1.1.5/kamireader-1.1.5-pre-release.apk

  Todas las versiones:
  https://github.com/jesusberrios/kami-reader-app/releases

  ⚠  Requisitos:
     • Android 7.0 o superior (API level 24+)
     • ~103 MB de espacio libre
     • Activar "Instalar desde fuentes desconocidas" en Ajustes > Seguridad

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🔧  DESARROLLO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Instalar dependencias:
    npm install

  Correr en modo desarrollo (requiere dispositivo/emulador):
    npx expo run:android

  Compilar APK de release:
    cd android
    # PowerShell / CMD (Windows)
    .\gradlew.bat assembleRelease

    # Git Bash / WSL
    ./gradlew assembleRelease

  Si falla por JAVA_HOME inválido, usa JDK 17:
    $env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
    $env:Path="$env:JAVA_HOME\bin;$env:Path"
    .\gradlew.bat assembleRelease

  Si falla con ninja/cmake (react-native-iap) por rutas largas:
    ERROR típico: "ninja: error: mkdir(...): No such file or directory"
    1) Abre PowerShell como Administrador y ejecuta:
       Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1
    2) Reinicia Windows.
    3) Ejecuta de nuevo el build en PowerShell (no pegues dos comandos en una sola línea).

  Si LongPathsEnabled ya está en 1 y sigue fallando react-native-iap:
    # Verifica valor actual
    Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled

    # Usa una ruta física corta y reinstala dependencias
    cd C:\
    if (Test-Path .\krapp) { Remove-Item -Recurse -Force .\krapp }
    Copy-Item -Recurse "C:\Users\thega\Documents\Proyectos\kami-reader-app" .\krapp
    cd .\krapp
    if (Test-Path .\node_modules) { Remove-Item -Recurse -Force .\node_modules }
    if (Test-Path .\package-lock.json) { Remove-Item -Force .\package-lock.json }
    npm install

    # Compila release desde la ruta corta
    cd .\android
    .\gradlew.bat clean
    .\gradlew.bat :react-native-reanimated:prefabReleasePackage
    .\gradlew.bat assembleRelease

  El APK se genera en:
    android/app/build/outputs/apk/release/app-release.apk

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🌐  REPOSITORIO
  https://github.com/jesusberrios/kami-reader-app

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

