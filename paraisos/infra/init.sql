CREATE TABLE IF NOT EXISTS spot (
    id              SERIAL          PRIMARY KEY,
    nombre          TEXT            NOT NULL,
    region          TEXT,
    provincia       TEXT,
    latitud         DOUBLE PRECISION NOT NULL,
    longitud        DOUBLE PRECISION NOT NULL,
    imagen_url      TEXT,
    descripcion     TEXT,
    categoria       TEXT            NOT NULL CHECK (categoria IN ('piscina', 'ruta', 'playa')),
    activo          BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_spot_updated_at
    BEFORE UPDATE ON spot
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_spot_activo ON spot(activo);
CREATE INDEX IF NOT EXISTS idx_spot_categoria ON spot(categoria);
CREATE INDEX IF NOT EXISTS idx_spot_activo_categoria ON spot(activo, categoria);

-- ── Parking spots ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parking_spot (
    id          SERIAL          PRIMARY KEY,
    spot_id     INTEGER         NOT NULL REFERENCES spot(id),
    latitud     DOUBLE PRECISION NOT NULL,
    longitud    DOUBLE PRECISION NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_parking_spot_updated_at
    BEFORE UPDATE ON parking_spot
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_parking_spot_spot_id ON parking_spot(spot_id);
CREATE INDEX IF NOT EXISTS idx_parking_spot_activo ON parking_spot(activo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parking_spot_active_unique ON parking_spot(spot_id) WHERE activo = true;

-- Seed: spots importados de las Google Sheets originales del proyecto Paraísos
INSERT INTO spot (nombre, region, provincia, latitud, longitud, imagen_url, categoria) VALUES
-- EXTREMADURA
('Garganta la Olla', 'Extremadura', 'Cáceres', 40.117063, -5.777798, NULL, 'piscina'),
('Garganta de los Infiernos (Los Pilones)', 'Extremadura', 'Cáceres', 40.200967, -5.754287, '/paraisos/api/images/garganta-infiernos.jpg', 'piscina'),
('Chorritero de Ovejuela', 'Extremadura', 'Cáceres', 40.319095, -6.447396, '/paraisos/api/images/chorrituelo-ovejuela.jpg', 'piscina'),
('Cantera de Alcántara', 'Extremadura', 'Cáceres', 39.746282, -6.892419, NULL, 'piscina'),
('Garganta de Cuartos', 'Extremadura', 'Cáceres', 40.110806, -5.581752, NULL, 'piscina'),
('Cascada El Trabuquete', 'Extremadura', 'Cáceres', 40.176689, -5.644560, NULL, 'piscina'),
('Cascada El Diablo', 'Extremadura', 'Cáceres', 40.130485, -5.448248, '/paraisos/api/images/cascada-diablo.jpg', 'piscina'),
('Cascada de Caozo', 'Extremadura', 'Cáceres', 40.133295, -5.852645, '/paraisos/api/images/cascada-caozo.jpg', 'ruta'),
('Mirador de la Memoria', 'Extremadura', 'Cáceres', 40.123650, -5.947620, NULL, 'ruta'),
('Cascada Las Nogaledas', 'Extremadura', 'Cáceres', 40.186090, -5.828288, '/paraisos/api/images/cascada-las-nogaledas.jpg', 'piscina'),
('Granadilla', 'Extremadura', 'Cáceres', 40.268415, -6.106415, '/paraisos/api/images/granadilla.jpg', 'ruta'),
-- PORTUGAL
('Pego do Inferno', 'Portugal', 'Mosteiros', 37.155439, -7.695587, '/paraisos/api/images/pego-do-inferno.jpg', 'piscina'),
('Benagil', 'Portugal', NULL, 37.087223, -8.423711, '/paraisos/api/images/benagil.jpg', 'piscina'),
-- CASTILLA Y LEÓN
('Garganta de los Caballeros', 'Castilla y León', 'Ávila', 40.267461, -5.515565, '/paraisos/api/images/garganta-caballeros.jpg', 'piscina'),
('Calderas del río Cambrones', 'Castilla y León', 'Segovia', 40.929279, -3.983868, '/paraisos/api/images/calderas-del-rio-cambrones.jpg', 'piscina'),
('Pedrosa de Tobalina', 'Castilla y León', 'Burgos', 42.848212, -3.333983, '/paraisos/api/images/pedrosa-tobalina.jpg', 'piscina'),
('Lagunas Sierra de Gredos', 'Castilla y León', 'Ávila', 40.271336, -5.300248, '/paraisos/api/images/lagunas-sierra-de-gredos.jpg', 'piscina'),
('Tobera', 'Castilla y León', 'Burgos', 42.750698, -3.303743, '/paraisos/api/images/tobera.jpg', 'piscina'),
('Frías', 'Castilla y León', 'Burgos', 42.762284, -3.295004, '/paraisos/api/images/frias-burgos.jpg', 'ruta'),
-- CASTILLA LA MANCHA
('Lagunas del Ruidera', 'Castilla-La Mancha', 'Albacete', 38.931708, -2.837395, '/paraisos/api/images/lagunas-ruidera.jpg', 'piscina'),
('Chorreras del Cabriel', 'Castilla-La Mancha', 'Cuenca', 39.704774, -1.617435, '/paraisos/api/images/chorreras-del-cabriel.jpg', 'piscina'),
('Playa de Bolarque', 'Castilla-La Mancha', 'Guadalajara', 40.340956, -2.815162, '/paraisos/api/images/playa-de-bolarque.jpg', 'piscina'),
('Alto Tajo', 'Castilla-La Mancha', 'Guadalajara', 40.718539, -2.072713, '/paraisos/api/images/alto-tajo.jpg', 'piscina'),
('Nacimiento del Río Cuervo', 'Castilla-La Mancha', 'Cuenca', 40.428265, -1.891338, '/paraisos/api/images/nacimiento-rio-cuervo.jpg', 'piscina'),
-- ANDALUCÍA
('Alcazaba Lagoon', 'Andalucía', 'Málaga', 36.414872, -5.224497, NULL, 'piscina'),
('Caminito del Rey', 'Andalucía', 'Málaga', 36.931887, -4.789986, '/paraisos/api/images/caminito-del-rey.jpg', 'ruta'),
('Ruta del río Borosa', 'Andalucía', 'Jaén', 37.971076, -2.819377, '/paraisos/api/images/rio-borosa.jpg', 'piscina'),
('Los Cahorros de Monachil', 'Andalucía', 'Granada', 37.129297, -3.523406, '/paraisos/api/images/cahorros-de-monachil.jpg', 'piscina'),
('Cueva del Agua', 'Andalucía', 'Jaén', 37.768059, -3.024397, '/paraisos/api/images/cueva-del-agua.jpg', 'piscina'),
('El Pilón Azul', 'Andalucía', 'Jaén', 37.762556, -3.023938, NULL, 'piscina'),
('Baños de la Hedionda', 'Andalucía', 'Málaga', 36.396586, -5.261562, '/paraisos/api/images/banos-de-la-hedionda.jpg', 'piscina'),
-- MURCIA
('Salto del Usero', 'Murcia', 'Murcia', 38.026020, -1.674227, '/paraisos/api/images/salto-del-usero.jpg', 'piscina'),
('Poza de las Tortugas', 'Murcia', 'Murcia', 38.235263, -2.009899, NULL, 'piscina'),
('Mirador Alto de Bayna', 'Murcia', 'Murcia', 38.176227, -1.365922, NULL, 'ruta'),
('Cañón de Almadenes', 'Murcia', 'Murcia', 38.238962, -1.556824, '/paraisos/api/images/canon-de-almadenes.jpg', 'piscina'),
('Cueva Sima de la Serreta', 'Murcia', 'Murcia', 38.241494, -1.570556, NULL, 'ruta'),
-- COMUNIDAD VALENCIANA
('La Jarra', 'Comunidad Valenciana', 'Valencia', 39.393520, -0.765307, NULL, 'piscina'),
('Fuentes de los Baños', 'Comunidad Valenciana', 'Valencia', 40.074181, -0.533676, NULL, 'piscina'),
('Río Bolbaite', 'Comunidad Valenciana', 'Valencia', 39.062888, -0.676089, '/paraisos/api/images/rio-bolbaite.jpg', 'piscina'),
('Pou Clar', 'Comunidad Valenciana', 'Valencia', 38.798820, -0.612532, '/paraisos/api/images/pou-clar.jpg', 'piscina'),
('Charco Azul de Chulilla', 'Comunidad Valenciana', 'Valencia', 39.665033, -0.892200, '/paraisos/api/images/charco-azul-chulilla.jpg', 'piscina'),
('Charcos de Quesa', 'Comunidad Valenciana', 'Valencia', 39.088597, -0.783150, NULL, 'piscina'),
('Cala de la Mina', 'Comunidad Valenciana', 'Alicante', 38.565301, -0.053940, NULL, 'piscina'),
('Cala dels Testos', 'Comunidad Valenciana', 'Alicante', 38.711866, 0.171326, NULL, 'piscina'),
('Cala Racó del Corb', 'Comunidad Valenciana', 'Alicante', 38.631748, 0.010048, NULL, 'piscina'),
('La Granadella', 'Comunidad Valenciana', 'Alicante', 38.729716, 0.197086, '/paraisos/api/images/la-granadella.jpg', 'piscina'),
('En Caló', 'Comunidad Valenciana', 'Alicante', 38.732206, 0.213115, NULL, 'piscina'),
('Barranco de la Encantada', 'Comunidad Valenciana', 'Alicante', 38.795658, -0.316591, NULL, 'piscina'),
('Salto de Chella', 'Comunidad Valenciana', 'Valencia', 39.047148, -0.660906, '/paraisos/api/images/salto-de-chella.jpg', 'piscina'),
('Cueva de San José', 'Comunidad Valenciana', 'Valencia', 39.823463, -0.250294, '/paraisos/api/images/cueva-de-san-jose.jpg', 'ruta'),
('Chorradores de Navarrés', 'Comunidad Valenciana', 'Valencia', 39.110323, -0.710089, NULL, 'piscina'),
('Cascada El Monstruo', 'Comunidad Valenciana', 'Valencia', 39.243044, -0.766402, NULL, 'piscina'),
('Fuentes de Algar', 'Comunidad Valenciana', 'Alicante', 38.660624, -0.094943, '/paraisos/api/images/fuentes-del-algar.jpg', 'piscina'),
('Cueva de las Palomas', 'Comunidad Valenciana', 'Valencia', 39.401713, -0.800288, '/paraisos/api/images/cueva-de-las-palomas.jpg', 'piscina'),
-- GALICIA
('Playa de las Catedrales', 'Galicia', 'Lugo', 43.554691, -7.152489, '/paraisos/api/images/catedras-playa.jpg', 'playa'),
('Cueva de la Doncella', 'Galicia', 'Lugo', 43.701446, -7.607073, NULL, 'ruta'),
('Playa de Lagoelas', 'Galicia', 'A Coruña', 42.358029, -8.941302, NULL, 'playa'),
('Islote de Areoso', 'Galicia', 'A Coruña', 42.543426, -8.898838, '/paraisos/api/images/islote-de-areoso.jpg', 'piscina'),
('Pozo da Ferida', 'Galicia', 'Lugo', 43.615644, -7.534753, NULL, 'piscina'),
-- ASTURIAS
('Playa Gulpiyuri', 'Asturias', 'Asturias', 43.447505, -4.885985, '/paraisos/api/images/playa-gulpiyuri.jpg', 'playa'),
('Lagos de Saliencia', 'Asturias', 'Asturias', 43.054068, -6.103252, '/paraisos/api/images/lagos-de-saliencia.jpg', 'piscina'),
('Ruta del Cares', 'Asturias', 'Asturias', 43.255205, -4.836635, '/paraisos/api/images/ruta-cares.jpg', 'ruta'),
-- NAVARRA
('Nacedero de Urederra', 'Navarra', 'Navarra', 42.744797, -2.089381, '/paraisos/api/images/nacedero-de-urederra.jpg', 'piscina'),
-- ARAGÓN
('Fuente la Tamara', 'Aragón', 'Huesca', 42.196395, -0.092188, NULL, 'piscina'),
('Salto del Bierge', 'Aragón', 'Huesca', 42.173447, -0.090710, NULL, 'piscina'),
('Fayón', 'Aragón', 'Zaragoza', 41.246698, 0.353485, '/paraisos/api/images/fayon.jpg', 'piscina'),
('Ordesa - Cascada Cola de Caballo', 'Aragón', 'Huesca', 42.650828, 0.015518, '/paraisos/api/images/cascada-cola-de-caballo.jpg', 'piscina'),
('Aguas Tuertas', 'Aragón', 'Huesca', 42.834401, -0.627693, NULL, 'ruta'),
('Barranco La Peonera', 'Aragón', 'Huesca', 42.187320, -0.086586, NULL, 'piscina'),
-- CATALUÑA
('Embalse Llosa del Cavall', 'Cataluña', 'Lleida', 42.117579, 1.606155, '/paraisos/api/images/embalse-llosa-del-cavall.jpg', 'piscina'),
('Toll de L''Olla', 'Cataluña', 'Tarragona', 41.311499, 1.063881, NULL, 'piscina'),
('Gorgs de la Febró', 'Cataluña', 'Tarragona', 41.259880, 0.975794, '/paraisos/api/images/gorgs-de-la-febro.jpg', 'piscina'),
('Gorgs Blau', 'Cataluña', 'Girona', 42.320066, 2.585916, NULL, 'piscina'),
('Castellfollit de la Roca', 'Cataluña', 'Girona', 42.219545, 2.548864, '/paraisos/api/images/castellfollit-de-la-roca.jpg', 'ruta'),
('Cascada del Gerber', 'Cataluña', 'Lleida', 42.643536, 1.009381, NULL, 'piscina'),
('Congost de Mont-Rebei', 'Cataluña', 'Lleida', 42.082882, 0.682925, '/paraisos/api/images/congost-mont-rebei.jpg', 'ruta'),
-- ISLAS BALEARES
('Cala Saona', 'Islas Baleares', 'Formentera', 38.693448, 1.385037, '/paraisos/api/images/cala-saona.jpg', 'piscina'),
('Ses Illetes', 'Islas Baleares', 'Formentera', 38.759609, 1.435673, '/paraisos/api/images/ses-illetes.jpg', 'piscina'),
-- ISLAS CANARIAS
('Cueva de la Reina', 'Islas Canarias', 'Gran Canaria', 28.010839, -15.375553, NULL, 'piscina'),
('Playa de Castro', 'Islas Canarias', 'Tenerife', 28.397651, -16.592535, NULL, 'playa'),
('Playa de la Montaña Amarilla', 'Islas Canarias', 'Tenerife', 28.009257, -16.638706, '/paraisos/api/images/montana-amarilla.jpg', 'playa'),
('Playa de Benijo', 'Islas Canarias', 'Tenerife', 28.576109, -16.185178, '/paraisos/api/images/playa-benijo.jpg', 'playa'),
('Playa de Almáciga', 'Islas Canarias', 'Tenerife', 28.571224, -16.203570, '/paraisos/api/images/playa-de-almaciga.jpg', 'playa'),
('Playa de Los Roques', 'Islas Canarias', 'Tenerife', 28.396062, -16.648974, NULL, 'playa'),
('Charco Verde', 'Islas Canarias', 'Tenerife', 28.400164, -16.659036, NULL, 'piscina'),
('Charco del Viento', 'Islas Canarias', 'Tenerife', 28.400780, -16.673962, '/paraisos/api/images/charco-del-viento.jpg', 'piscina'),
('Piscinas naturales Los Abrigos', 'Islas Canarias', 'Tenerife', 28.029208, -16.582612, NULL, 'piscina'),
('Cueva de la Vaca', 'Islas Canarias', 'Tenerife', 28.228904, -16.842580, NULL, 'piscina'),
('Piscina natural Mesas del Mar', 'Islas Canarias', 'Tenerife', 28.503907, -16.424546, NULL, 'piscina'),
('Charco Azul', 'Islas Canarias', 'El Hierro', 27.776177, -18.038799, '/paraisos/api/images/charco-azul.jpg', 'piscina'),
-- CROACIA
('Lagos de Plitvice', 'Croacia', NULL, 44.900169, 15.610921, '/paraisos/api/images/lagos-plitvice.jpg', 'piscina'),
-- FILIPINAS
('Twin Lagoon (Coron Island)', 'Filipinas', NULL, 11.947653, 120.209683, NULL, 'piscina'),
-- PLAYAS (segunda hoja)
('Playa La Rijana', 'Andalucía', 'Granada', 36.709604, -3.391085, '/paraisos/api/images/playa-rijana.jpg', 'playa'),
('Playa de Bolonia', 'Andalucía', 'Cádiz', 36.088512, -5.778693, '/paraisos/api/images/playa-de-bolonia.jpg', 'playa'),
('Calas de Roche', 'Andalucía', 'Cádiz', 36.311139, -6.152333, '/paraisos/api/images/calas-de-roche.jpg', 'playa'),
('Playa de Toró', 'Asturias', 'Asturias', 43.416598, -4.743457, '/paraisos/api/images/playa-de-toro.jpg', 'playa'),
('Playa de Poo', 'Asturias', 'Asturias', 43.428962, -4.784109, '/paraisos/api/images/playa-de-poo.jpg', 'playa'),
('Playa de Ballota', 'Asturias', 'Asturias', 43.410021, -4.711833, '/paraisos/api/images/playa-de-ballota.jpg', 'playa'),
('Playa de Barro', 'Asturias', 'Asturias', 43.436528, -4.825807, '/paraisos/api/images/playa-de-barro.jpg', 'playa'),
('Playa de Cué', 'Asturias', 'Asturias', 43.415140, -4.730875, NULL, 'playa');
