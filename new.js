// let arr = ['a',2,3]

const { getMaxListeners } = require("./models/userModel")

// if(arr.includes('a')){
//     console.log('muju')
// }


// let flag = 0
// let count = 0
// let s = "l|*e*et|c**o|*de|"
// for(let i=0;i<s.length;i++){
//     if(s[i]==='|'){
//         flag++
//     }
//     if(flag%2==0){
//         if(s[i]==='*'){
//             count++
//         }
//     }
// }

// console.log(count)

// let n = 4
// if (n === 1) return 0;

// let steps = 0;
// let factor = 2;

// while (n > 1) {
//     while (n % factor === 0) {
//         steps += factor;
//         n = Math.floor(n / factor);
//     }
//     factor++;
// }

// console.log(steps)

// let arr = ["a","b","a"]
// let k = 3

// let unique = arr.filter((item, index, arr)=>{
//     return arr.indexOf(item) === arr.lastIndexOf(item)
// })

// if(k > unique.length){
//     console.log(unique[k])
// }

// let words = ["abc","car","ada","racecar","cool"]



// for(let i=0;i<words.length;i++){
//     if(words[i]==words[i].split('').reverse().join('')){
//         console.log(words[i])
//     }
// }


// let nums1 = [4,9,5]
// let nums2 = [9,4,9,8,4]
// let ans = []

// for(let i=0;i<nums1.length;i++){
//     for(let j=0;j<nums2.length;j++){
//         if(nums1[i]===nums2[j]){
//             ans.push(nums1[i])
//         }
//     }
// }
// let final = [...new Set(ans)]

// console.log(final)


// let nums = [1,2,3,4,5]
// let k = 3
// let ans = 0
// for(let i=0;i<k;i++){
//     let maxIndex = nums.indexOf(Math.max(...nums))
//     ans+=nums[maxIndex]
//     nums.splice(maxIndex, 1, nums[maxIndex]+1)
// }
// console.log(ans)

// let s = "(()())(())"
// let ans = s.split('')
// let final = []
// for(let i=0;i<ans.length;i++){
//     if(s[i] !== s[i+1]){
//         final.push(s[i])
//     }
// }
// console.log(final.toString())

// let s = "RLRRLLRLRL"
// let temp = 0;
// let ans = 0;

//   for (let letter of s) {
//     if (letter === 'L'){
//         temp--;
//     }else{
//         temp++;
//     }

//     if(temp===0){
//         ans++
//     }
//   }
// console.log(ans)

// let garbage = ["P","P"]
// let travel = [1]
// let gtime = 0
// let ptime = 0
// let mtime = 0

// let gx = garbage.length - 1
// while (gx >= 0) {
//     if (garbage[gx].includes('G')) {
//         break
//     } else {
//         gx--;
//     }
// }

// for (let t = 0; t < travel.length; t++) {
//     if (t < gx) {
//         gtime += travel[t]
//     }
// }

// let px = garbage.length - 1
// while (px >= 0) {
//     if (garbage[px].includes('P')) {
//         break
//     } else {
//         px--;
//     }
// }

// for (let t = 0; t < travel.length; t++) {
//     if (t < px) {
//         ptime += travel[t]
//     }
// }

// let mx = garbage.length - 1
// while (mx >= 0) {
//     if (garbage[mx].includes('M')) {
//         break
//     } else {
//         mx--;
//     }
// }

// for (let t = 0; t < travel.length; t++) {
//     if (t < mx) {
//         ptime += travel[t]
//     }
// }


// for (let i = 0; i < garbage.length; i++) {

//     if (garbage[i].includes('G')) {
//         for (let j = 0; j < garbage[i].length; j++) {
//             if (garbage[i][j] == 'G') {
//                 gtime++
//             }
//         }
//     }
//     console.log(ptime)
//     if (garbage[i].includes('P')) {
//         for (let j = 0; j < garbage[i].length; j++) {
//             if (garbage[i][j] == 'P') {
//                 ptime++
//                 console.log(garbage[i],ptime)
//             }
//         }
//     }

//     if (garbage[i].includes('M')) {
//         for (let j = 0; j < garbage[i].length; j++) {
//             if (garbage[i][j] == 'M') {
//                 mtime++
//             }
//         }
//     }
// }

// let totalTime = ptime+gtime+mtime
// console.log(totalTime)

// let s = "32"
// let arr = s.split('')
// console.log(Math.max(...arr))

// let promise1 = new Promise((resolve, reject) => {
//     reject('promise11')
// })

// let promise2 = new Promise((resolve, reject) => {
//     reject('success')
// })

// let promise3 = new Promise((resolve, reject) => {
//     reject('failed')
// })

// Promise.any([promise1, promise2, promise3]).then((res) => {
//     console.log(res)
// }).catch((err) => {
//     console.log('some error occcured :', err)
// })

// let nums = [1,2,3,4,5,6,7,8,9,0]
// let arr =[]
// for(let i=0;i<nums.length;i++){
//     if(i%10===nums[i]){
//         arr.push(i)
//     }
// }
// const result = Math.min(...arr)
// if(result === Infinity){
//     console.log(-1)
// }else{
//     console.log(result)
// }


// let nums = [2,5,6,9,10]
// let min = Math.min(...nums)
// let max = Math.max(...nums)



// function gcd(a, b) {
//     if ( b === 0 ) {
//         return a;
//     }
//     return gcd(b, a % b);
// }

// // console.log(myFunction(min,max))

// function lcmFunction( a, b ) {
//     const gcdValue = gcd( a, b );
//     return (a * b) / gcdValue;
// }

// console.log(lcmFunction(2,10))

// let nums = [8,19,4,2,15,3]
// let original = 2

// for(let i=0;i<nums.length;i++){
//     if(nums.includes(original)){
//         original = 2*nums[i]
//     }else{
//         console.log(original)
//     }
// }
// console.log(original)

// let nums = [2,7,1,19,18,3]
// let ans = 0
// let n = nums.length
// for(let i=0;i<nums.length;i++){
//     if( n % (i+1) == 0){
//         ans += Math.pow(nums[i],2)
//     }
// }
// console.log(ans)



// let nums = [9,6,4,2,3,5,7,0,1]
// nums.sort((a,b)=>a-b)

// for(let i=0;i<nums.length+1;i++){
//     if(i!=nums[i]){
//         console.log(i)
//     }
// }

// let nums = [1,2,3,2]

// let ans = nums.filter((item, index, arr) =>{
//     return arr.indexOf(item) === arr.lastIndexOf(item)
// })
// let result = ans.reduce((item, acc)=> item+acc, 0)

// console.log(result)


let words1 = ["leetcode", "is", "amazing", "as", "is"]
let words2 = ["amazing", "leetcode", "is"]


let word1 = [...new Set(words1)]
let word2 = [...new Set(words2)]
console.log(word1)
