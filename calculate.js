const moment = require('moment-timezone');
const thaiTimezone = 'Asia/Bangkok';


function getCurrentDate(currentDate) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hours = currentDate.getHours();
    const minutes = currentDate.getMinutes();
  
    const formattedDate = `${year}-${month}-${day}`;
  
    if ((hours > 7 || (hours === 7 && minutes >= 30)) && (hours < 23 || (hours === 23 && minutes <= 59))) {
      return formattedDate;
    } else {
      // If the time is between 00:00 and 07:39, subtract one day.
      const yesterday = new Date(currentDate);
      yesterday.setDate(currentDate.getDate() - 1);
      const yYear = yesterday.getFullYear();
      const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yDay = String(yesterday.getDate()).padStart(2, '0');
  
      return `${yYear}-${yMonth}-${yDay}`;
    }
  }
  
  const currentDate = new Date('2023-10-13 07:30:00');
  console.log(moment(currentDate).tz(thaiTimezone).format('YYYY-MM-DD HH:mm:ss'))
  const formattedDate = getCurrentDate(currentDate);
  console.log(formattedDate);