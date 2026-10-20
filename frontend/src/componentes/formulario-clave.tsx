import { useState } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { mdiAccount, mdiEye, mdiEyeOff, mdiLock, mdiLogin } from '@mdi/js'
import { api } from '../lib/api'
import { guardarSesion, type Sesion } from '../lib/sesion'
import { Boton } from './boton'
import { Icono } from './icono'

/**
 * La entrada de Administración: usuario y contraseña, como en cualquier
 * sistema de escritorio. La encargada y el dueño manejan dinero y personal;
 * un PIN de cuatro cifras sería poca llave para eso.
 */
export function FormularioClave({ alEntrar }: { alEntrar?: (s: Sesion) => void }) {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const temblor = useAnimationControls()

  const entrar = async () => {
    if (!usuario.trim() || !clave) return setError('Escribe tu usuario y tu contraseña.')
    setEnviando(true)
    setError(null)
    try {
      const sesion = await api<Sesion>('/auth/entrar', { cuerpo: { usuario: usuario.trim(), clave } })
      guardarSesion(sesion)
      alEntrar?.(sesion)
    } catch (e) {
      setError((e as Error).message)
      setClave('')
      void temblor.start({ x: [0, -10, 8, -6, 4, 0], transition: { duration: 0.4 } })
    } finally {
      setEnviando(false)
    }
  }

  const fila = 'flex h-12 items-stretch border bg-hoja transition-colors focus-within:border-azul focus-within:shadow-[inset_0_0_0_1px_var(--color-azul)]'

  return (
    <motion.form
      animate={temblor}
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void entrar()
      }}
    >
      <label className={`${fila} ${error ? 'border-rojo' : 'border-reja-2'}`}>
        <span className="grid w-11 shrink-0 place-items-center border-r border-reja bg-gris-50 text-tinta-3">
          <Icono d={mdiAccount} className="size-5" />
        </span>
        <input
          value={usuario}
          onChange={(e) => setUsuario(e.target.value.slice(0, 40))}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Usuario"
          aria-label="Usuario"
          className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-tinta-4"
        />
      </label>
      <label className={`${fila} ${error ? 'border-rojo' : 'border-reja-2'}`}>
        <span className="grid w-11 shrink-0 place-items-center border-r border-reja bg-gris-50 text-tinta-3">
          <Icono d={mdiLock} className="size-5" />
        </span>
        <input
          type={ver ? 'text' : 'password'}
          value={clave}
          onChange={(e) => setClave(e.target.value.slice(0, 72))}
          autoComplete="current-password"
          placeholder="Contraseña"
          aria-label="Contraseña"
          className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-tinta-4"
        />
        <button
          type="button"
          onClick={() => setVer(!ver)}
          title={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="grid w-11 shrink-0 place-items-center text-tinta-3 hover:text-tinta"
        >
          <Icono d={ver ? mdiEyeOff : mdiEye} className="size-5" />
        </button>
      </label>
      <p role="status" className={`flex min-h-5 items-center text-[13px] ${error ? 'text-rojo' : 'text-tinta-3'}`}>
        {error ?? 'Solo la encargada de sucursal y la administración.'}
      </p>
      <Boton type="submit" variante="guardar" icono={mdiLogin} cargando={enviando} className="h-12 text-[15px]">
        Ingresar
      </Boton>
    </motion.form>
  )
}
