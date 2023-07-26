export type Log = {
  body: string,
  severity: string,
  timestamp: number,
  id: string,
  stringField: string,
  numberField: number,
  objectField: object,
}

export async function fetchLogs(count: number, from: number, to: number): Promise<Log[]> {  
  return new Promise((resolve) => {
  setTimeout(() => {
    resolve(createLogs(count, from, to));
  }, 300);
  })
}

function createLogs(count: number, from: number, to: number) {
  const logs: Log[] = []
  for (let i = 0; i < count; i++) {
    const timestamp = Math.floor(Math.random() * (to - from + 1) + from) 
    const id = `id ${from}${to}${i}`
    const severity = i % 5 === 1 ? 'error' : 'info'
    const number = i+ 1000
    const string = `string ${i}`
    logs.push({
      body: `timestamp=${timestamp} line=${i} id=${id} number=${number} string=${string}`,
      severity,
      timestamp,
      id,
      stringField: string,
      numberField: number,
      objectField: {
        key: `value ${i}`,
      },
    })
  }

  return logs.sort((a, b) => a.timestamp - b.timestamp)
}
