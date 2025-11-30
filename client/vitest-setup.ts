if (typeof global.navigator === 'undefined') {
    global.navigator = {
        userAgent: 'node.js',
        // Add any other properties that you need to mock
    } as Navigator;
}

if (typeof window !== "undefined") {
    // Safe to use window here
    window = global as any;
}
