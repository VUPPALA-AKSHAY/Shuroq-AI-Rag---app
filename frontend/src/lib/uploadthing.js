// Local upload simulator.
export async function uploadFiles(_endpoint, { files, onUploadProgress }) {
  const CHUNK_COUNT = 10;
  const TICK_MS = 120;

  const results = await Promise.all(
    files.map(async (file) => {
      for (let i = 1; i <= CHUNK_COUNT; i++) {
        await delay(TICK_MS);
        onUploadProgress?.({ file, progress: (i / CHUNK_COUNT) * 100 });
      }

      const url = URL.createObjectURL(file);
      return { name: file.name, size: file.size, url };
    })
  );

  return results;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
