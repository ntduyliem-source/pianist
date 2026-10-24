// Match Vietnamese with or without accents, including Đ (which NFD does not decompose).
export function searchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi')
    .trim()
    .replace(/\s+/g, ' ');
}
export function matchesSearch(text: string, query: string): boolean {
  return searchText(text).includes(searchText(query));
}
