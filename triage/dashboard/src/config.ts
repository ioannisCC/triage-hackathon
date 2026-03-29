const isDev = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1'

export const API_URL = isDev ? 'http://localhost:4021' : ''
export const WS_URL = isDev
  ? 'ws://localhost:4022'
  : `wss://${window.location.host}/ws`
