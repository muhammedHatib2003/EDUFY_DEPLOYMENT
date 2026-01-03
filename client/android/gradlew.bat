@echo off
set DIR=%~dp0
"%DIR%\.gradle\wrapper\dists" >nul 2>&1
java -classpath "%DIR%\gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
