import { createServer } from "node:net"

export async function reserveSerenaLocalPort(): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const server = createServer()
		server.once("error", reject)
		server.listen(0, "127.0.0.1", () => {
			const address = server.address()
			const port = typeof address === "object" && address ? address.port : null
			server.close((error) => {
				if (error) {
					reject(error)
					return
				}

				if (!port) {
					reject(new Error("Failed to reserve a localhost Serena MCP port"))
					return
				}

				resolve(port)
			})
		})
	})
}
