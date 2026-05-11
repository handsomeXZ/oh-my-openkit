export async function waitForDelay(milliseconds: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
