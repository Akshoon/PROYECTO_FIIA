# TODO - Proyecto Grafo Interactivo de Eventos Musicales

## ✅ Cambios Completados - Actualización Visual del Grafo con Filtros Avanzados

### 1. Actualización de la Interfaz de Usuario (HTML)
- [x] Agregada barra de búsqueda en el grafo
- [x] Agregada leyenda con tipos de nodos y colores
- [x] Agregados controles de zoom (+, -, ajustar)
- [x] Agregado panel de estadísticas
- [x] Reemplazado slider de timeline por selector de año simple
- [x] Agregada sección completa de filtros avanzados:
  - Filtro por año (dropdown)
  - Filtro por compositor (input text)
  - Filtro por participante (input text)
  - Filtro por obra (input text)
  - Filtro por evento (input text)
  - Filtro por ciudad (input text)
  - Selector de límite de eventos (100-1000)
  - Botón "Limpiar Filtros"

### 2. Actualización de Estilos (CSS)
- [x] Cambiado fondo del grafo a color claro (#f8f9fa)
- [x] Estilizada barra de búsqueda flotante
- [x] Estilizada leyenda con colores de nodos
- [x] Estilizados controles de zoom circulares
- [x] Estilizado panel de estadísticas
- [x] Actualizados estilos para selector de año (removido timeline slider)
- [x] Agregados estilos para sección de filtros avanzados

### 3. Actualización de Funcionalidad (JavaScript)
- [x] Actualizado esquema de colores de nodos a tonos grises:
  - Evento: Gris oscuro (#34495e)
  - Obra: Gris medio (#7f8c8d)
  - Persona (Compositor/Participante): Gris claro (#95a5a6)
  - Ciudad: Gris muy claro (#bdc3c7)
- [x] Implementado tamaño dinámico de nodos basado en conexiones
- [x] Implementada funcionalidad de búsqueda con resaltado
- [x] Implementados controles de zoom (acercar, alejar, ajustar)
- [x] Implementado cálculo y visualización de estadísticas
- [x] Simplificado estilo de nodos (sin gradientes pesados)
- [x] Reemplazada funcionalidad de timeline slider por selector de año simple
- [x] Agregada población automática del dropdown de años
- [x] Actualizado evento de carga para usar selector de año
- [x] Implementada funcionalidad completa de filtros avanzados:
  - Mapeo de filtros del frontend a parámetros de API
  - Envío de parámetros específicos (composer_q, participant_q, piece_q, name_q, city_q)
  - Integración con límite de eventos configurable
  - Función de limpiar filtros que resetea todos los campos

### 4. Actualización del Backend (Flask)
- [x] Agregado soporte para parámetro 'city_q' en la API
- [x] Mantenida compatibilidad con todos los parámetros existentes

## 📋 Características Implementadas

### Barra de Búsqueda
- Búsqueda en tiempo real de nodos
- Resalta nodos coincidentes y sus conexiones
- Atenúa elementos no relacionados

### Leyenda
- Muestra tipos de nodos con colores correspondientes
- Posicionada en la esquina superior derecha (ajustada para evitar conflicto con filtros)

### Controles de Zoom
- Botón + para acercar
- Botón - para alejar
- Botón ⊡ para ajustar vista
- Reposicionados para evitar conflicto con filtros

### Panel de Estadísticas
- Cuenta total de nodos
- Cuenta total de enlaces
- Desglose por tipo de nodo
- Actualización automática al cargar datos
- Agregado cálculo de grado promedio

### Selector de Año (Reemplazado)
- Dropdown simple para seleccionar un año específico
- Opción "Todos los años" para ver datos completos
- Botón "Cargar Datos" para aplicar filtro

### Filtros Avanzados
- Layout horizontal con scroll horizontal en móviles
- Grupos de filtros con ancho mínimo de 150px
- Campos de entrada para compositor, participante, obra, evento, ciudad
- Selector de límite de eventos (100-1000)
- Botón "Limpiar Filtros" que resetea todos los campos

## 🎨 Mejoras Visuales

1. **Nodos más limpios**: Forma circular, colores sólidos sin gradientes
2. **Fondo claro**: Mejor contraste y legibilidad
3. **Tamaño dinámico**: Nodos más grandes para elementos con más conexiones
4. **Bordes sutiles**: Bordes blancos de 2px para definición
5. **Transiciones suaves**: Animaciones de 0.3s para interacciones

## 🔄 Próximos Pasos Sugeridos

- [ ] Agregar exportación de grafo como imagen
- [ ] Implementar filtros adicionales por tipo de nodo
- [ ] Agregar tooltips informativos al pasar el mouse
- [ ] Implementar diferentes algoritmos de layout
- [ ] Agregar modo oscuro/claro
- [ ] Optimizar rendimiento para grafos grandes

## 📝 Notas

- El selector de año reemplaza completamente el timeline slider
- Los colores se cambiaron a tonos grises para un aspecto más profesional
- La búsqueda no distingue entre mayúsculas/minúsculas
- Las estadísticas se actualizan automáticamente al cargar nuevos datos
