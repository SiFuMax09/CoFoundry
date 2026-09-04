/**
 * Liest einen text/event-stream-Response-Body manuell aus (POST-basierte
 * SSE-Antworten lassen sich nicht mit dem EventSource-Browser-API nutzen,
 * das nur GET ohne Custom-Body unterstützt).
 */
export async function* readSseStream(response: Response): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      try {
        yield JSON.parse(dataLine.slice(6));
      } catch {
        // Unparsbare Zeile ignorieren statt abzustürzen.
      }
    }
  }
}
