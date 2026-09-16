.PHONY: all validar analizar docs limpiar

all: validar analizar docs

validar:
	python3 tools/validar.py

analizar:
	python3 tools/analizar.py --csv --json

docs:
	python3 tools/generar_matriz.py

limpiar:
	rm -f salidas/*.csv salidas/informe.json
