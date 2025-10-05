export default function Navbar() {
    return (
        <nav className="w-full p-4 bg-gray-800 text-white flex justify-between items-center">
            <img src="./assets/img/mountain.svg" alt="Logo" className="h-8 w-8 inline-block mr-4" />
            {/* <ul className="flex space-x-4">
                <li><a href="#" className="hover:underline">Home</a></li>
                <li><a href="#" className="hover:underline">About</a></li>
                <li><a href="#" className="hover:underline">Services</a></li>
                <li><a href="#" className="hover:underline">Contact</a></li>
            </ul> */}
        </nav>
    );
}