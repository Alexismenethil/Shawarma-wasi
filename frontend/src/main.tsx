import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import type { Usuario } from '@wasi/shared'
import './estilos.css'
import { api } from './lib/api'
import { guardarSesion, sesionActual } from './lib/sesion'
import { Inicio } from './vistas/inicio'
import { Area } from './vistas/acceso'
import { LibroMozo } from './vistas/mozo/libro'
import { Salon } from './vistas/mozo/salon'
import { Nota } from './vistas/mozo/nota'
import { Avisos } from './componentes/avisos'
import { Confirmaciones } from './componentes/dialogo'
import { Rueda } from './componentes/boton'

// Tras publicar una versión nueva, una tablet que seguía abierta pide archivos que ya no
// existen: se recarga una vez para traer la versión nueva (y no queda en blanco).
window.addEventListener('vite:preloadError', (evento) => {
  const ultima = Number(sessionStorage.getItem('wasi.recarga') ?? 0)
  if (Date.now() - ultima < 30_000) return
  evento.preventDefault()
  sessionStorage.setItem('wasi.recarga', String(Date.now()))
  location.reload()
})

// La sesión guardada se pone al día con el servidor: si a alguien le cambiaron el área o la
// sucursal mientras la tablet seguía abierta, la pantalla lo sabe al recargar.
if (sesionActual()) {
  void api<Usuario>('/auth/yo')
    .then((usuario) => {
      const s = sesionActual()
      if (s) guardarSesion({ ...s, usuario })
    })
    .catch(() => {})
}

// Cocina, caja y administración se cargan aparte: el celular del mozo baja solo lo suyo.
const Cocina = lazy(() => import('./vistas/cocina/cocina').then((m) => ({ default: m.Cocina })))
const Caja = lazy(() => import('./vistas/caja/caja').then((m) => ({ default: m.Caja })))
const Admin = lazy(() => import('./vistas/admin/admin').then((m) => ({ default: m.Admin })))

const cargando = (
  <div className="grid h-dvh place-items-center text-verde-2">
    <Rueda className="size-7" />
  </div>
)

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route
          path="/mozo"
          element={
            <Area area="MOZO">
              <LibroMozo />
            </Area>
          }
        >
          <Route index element={<Salon />} />
          <Route path=":mesaId" element={<Nota />} />
        </Route>
        <Route
          path="/cocina"
          element={
            <Area area="COCINA">
              <Suspense fallback={cargando}>
                <Cocina />
              </Suspense>
            </Area>
          }
        />
        <Route
          path="/caja"
          element={
            <Area area="CAJA">
              <Suspense fallback={cargando}>
                <Caja />
              </Suspense>
            </Area>
          }
        />
        <Route
          path="/admin/*"
          element={
            <Area area="PANEL">
              <Suspense fallback={cargando}>
                <Admin />
              </Suspense>
            </Area>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Avisos />
      <Confirmaciones />
    </BrowserRouter>
  </StrictMode>,
)
