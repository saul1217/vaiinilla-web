-- Seed sintético del harness E2E real. Solo PREPARA (tenants, personas, membresías, menú y
-- mesas); toda interacción bajo prueba pasa por la UI real. Prefijo DEV- y datos inventados.
-- Variables psql: uid_admin_a, uid_cajero_a, uid_mesero_a, uid_cocina_a, uid_admin_b.
BEGIN;

INSERT INTO establecimientos (id, nombre, slug, hora_cierre_forzado, tipo) VALUES
  ('e2e00000-0000-4000-8000-00000000000a', 'DEV-Cafe Norte', 'dev-cafe-norte', '23:59', 'cafeteria'),
  ('e2e00000-0000-4000-8000-00000000000b', 'DEV-Cafe Sur',   'dev-cafe-sur',   '23:59', 'cafeteria');

INSERT INTO usuarios (id, firebase_uid, nombre, email) VALUES
  ('e2e00000-0000-4000-8000-0000000000a1', :'uid_admin_a',  'DEV Admin Norte',  'admin.norte@e2e.vaiinilla.test'),
  ('e2e00000-0000-4000-8000-0000000000a2', :'uid_cajero_a', 'DEV Cajero Norte', 'cajero.norte@e2e.vaiinilla.test'),
  ('e2e00000-0000-4000-8000-0000000000a3', :'uid_mesero_a', 'DEV Mesero Norte', 'mesero.norte@e2e.vaiinilla.test'),
  ('e2e00000-0000-4000-8000-0000000000a4', :'uid_cocina_a', 'DEV Cocina Norte', 'cocina.norte@e2e.vaiinilla.test'),
  ('e2e00000-0000-4000-8000-0000000000b1', :'uid_admin_b',  'DEV Admin Sur',    'admin.sur@e2e.vaiinilla.test');

INSERT INTO membresias (id, usuario_id, establecimiento_id, rol, origen) VALUES
  ('e2e00000-0000-4000-8000-000000000a01', 'e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-00000000000a', 'admin',  'invitacion'),
  ('e2e00000-0000-4000-8000-000000000a02', 'e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-00000000000a', 'cajero', 'invitacion'),
  ('e2e00000-0000-4000-8000-000000000a03', 'e2e00000-0000-4000-8000-0000000000a3', 'e2e00000-0000-4000-8000-00000000000a', 'mesero', 'invitacion'),
  ('e2e00000-0000-4000-8000-000000000a04', 'e2e00000-0000-4000-8000-0000000000a4', 'e2e00000-0000-4000-8000-00000000000a', 'cocina', 'invitacion'),
  ('e2e00000-0000-4000-8000-000000000b01', 'e2e00000-0000-4000-8000-0000000000b1', 'e2e00000-0000-4000-8000-00000000000b', 'admin',  'invitacion');

INSERT INTO categorias (establecimiento_id, nombre, orden) VALUES
  ('e2e00000-0000-4000-8000-00000000000a', 'DEV-Cocina', 1),
  ('e2e00000-0000-4000-8000-00000000000a', 'DEV-Bebidas', 2),
  ('e2e00000-0000-4000-8000-00000000000b', 'DEV-Sur Menu', 1);

INSERT INTO productos (establecimiento_id, categoria_id, estacion_preparacion, nombre,
                       tiempo_estimado_min, precio_mostrador, precio_digital)
SELECT c.establecimiento_id, c.id, p.estacion, p.nombre, p.minutos, p.precio, p.precio
  FROM (VALUES
         ('DEV-Cocina',   'cocina', 'DEV-Chilaquiles',   12, 120.00),
         ('DEV-Bebidas',  'caja',   'DEV-Cafe americano', 3,  35.50),
         ('DEV-Sur Menu', 'cocina', 'DEV-Torta Sur',      8,  90.00)
       ) AS p(categoria, estacion, nombre, minutos, precio)
  JOIN categorias c ON c.nombre = p.categoria;

INSERT INTO espacios (establecimiento_id, nombre, tipo, qr_token, codigo) VALUES
  ('e2e00000-0000-4000-8000-00000000000a', 'Mesa 3', 'mesa', 'e2e-norte-mesa-3', '810003'),
  ('e2e00000-0000-4000-8000-00000000000a', 'Mesa 4', 'mesa', 'e2e-norte-mesa-4', '810004'),
  ('e2e00000-0000-4000-8000-00000000000b', 'Mesa 1', 'mesa', 'e2e-sur-mesa-1',   '820001');

COMMIT;
