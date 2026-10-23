export const projectDate = (at: number) =>
  new Date(at).toLocaleString('vi', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
