import subprocess
n=subprocess.check_output(['node','-e',"console.log(require('./src/engine.js').FACTS.length)"]).decode().strip()
h=open('src/app.html').read()
h=h.replace('/*__SOURCES__*/',open('src/sources.js').read()).replace('/*__ENGINE__*/',open('src/engine.js').read()).replace('/*__EXAMPLES__*/',open('src/examples.js').read()).replace('/*__APP__*/',open('src/app.js').read())
h=h.replace('База из 58 проверенных',f'База из {n} проверенных')
head='<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}img{max-width:100%}</style></head><body>\n'
open('index.html','w').write(head+h+'\n</body></html>\n')
