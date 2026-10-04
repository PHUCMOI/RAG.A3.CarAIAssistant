import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiGet } from '../../shared/api/client'
import type { Car } from '../../entities/car/model'

export function useCarQuestion() {
  const [params] = useSearchParams()
  const id = params.get('car'), name = params.get('carName')
  const [question, setQuestion] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setQuestion('')
    if (id && name) setQuestion(`Hãy tư vấn cho tôi về xe ${name}`)
    else if (id) apiGet<Car>(`/api/cars/${encodeURIComponent(id)}`, controller.signal)
      .then(car => { if (!controller.signal.aborted) setQuestion(`Hãy tư vấn cho tôi về xe ${car.displayName}`) })
      .catch(() => { /* Leave the composer editable when the car cannot be loaded. */ })
    return () => controller.abort()
  }, [id, name])
  return question
}
