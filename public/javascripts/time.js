var seconds = 0;
var minutes = 0;

function timer(){
    setInterval(() => {

        var timer = document.getElementById("timeDiv");
        seconds++;
        if(seconds >= 60){
            seconds = 0;
            minutes++;
        }

        if(seconds < 10){
            if(minutes < 10){
                timer.innerHTML = `Time: 0${minutes}.0${seconds}`;
            }
            else{
                timer.innerHTML = `Time: ${minutes}.0${seconds}`;
            }
        }
        else{
            if(minutes < 10){
                timer.innerHTML = `Time: 0${minutes}.${seconds}`;
            }
            else{
                timer.innerHTML = `Time: ${minutes}.${seconds}`;
            }
        }

    }, 1000)
}
