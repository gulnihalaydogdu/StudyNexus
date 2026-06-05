export function getDynamicMonths(count = 3) {
    const monthNames = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const now = new Date();
    const dynamicMonths = [];
    for (let i = 0; i < count; i++) {
        const calcMonth = (now.getMonth() + i) % 12;
        const calcYear = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
        dynamicMonths.push({ name: monthNames[calcMonth], year: calcYear });
    }
    return dynamicMonths;
}
