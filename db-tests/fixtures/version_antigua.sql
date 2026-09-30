-- Simula un proyecto de Supabase con una versión muy antigua de NOVA (anterior incluso a ident01):
-- tablas con los mismos nombres y otra estructura, un enum con el mismo nombre y otros valores, una vista,
-- una extensión instalada en public y un trigger en auth.users que inserta en columnas que ya no existen.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE TYPE rol_usuario AS ENUM ('vendedor', 'jefe');
CREATE TABLE dim_clientes (id serial PRIMARY KEY, codigo text, nombre text NOT NULL);
CREATE TABLE dim_usuarios (id uuid PRIMARY KEY, rol rol_usuario, equipo text);
CREATE TABLE perfiles (id uuid PRIMARY KEY, nombre text);
INSERT INTO dim_clientes (codigo, nombre) VALUES ('F1', 'Farmacia antigua');
CREATE VIEW vw_clientes AS SELECT codigo, nombre FROM dim_clientes;
CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, columna_que_no_existe) VALUES (NEW.id, NEW.email, 1);
  RETURN NEW;
END $$;
CREATE TRIGGER on_new_auth_user AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
