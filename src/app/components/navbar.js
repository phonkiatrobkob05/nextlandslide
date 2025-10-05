export default function Navbar() {
    return (
        <nav className="w-full p-4 px-8 bg-[#1B3C53] text-white flex items-center">
            <img src="./assets/img/mountain-city.svg" alt="Logo" className="h-8 w-8 inline-block mr-4" />
            <div className="font-bold">
                <h1>LAND SUBSIDENCE</h1>
            </div>
            {/* <ul className="flex space-x-4">
                <li><a href="#" className="hover:underline">Home</a></li>
                <li><a href="#" className="hover:underline">About</a></li>
                <li><a href="#" className="hover:underline">Services</a></li>
                <li><a href="#" className="hover:underline">Contact</a></li>
            </ul> */}
        </nav>
    );
}