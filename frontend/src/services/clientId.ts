const SESSION_KEY = 'ocr-client-id'
import { getUUID } from '../utils/crypto'

export function getClientId(): string {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
        id = getUUID()
        sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
}
