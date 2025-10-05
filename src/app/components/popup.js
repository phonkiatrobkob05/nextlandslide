export default function Popup() {
    return (
        <div>
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center">
                <div class="bg-white p-6 rounded-xl w-[400px]">
                    <h2 class="text-xl font-bold">What's New</h2>
                    <p>Version 2.0 adds new features!</p>
                    <button class="mt-4 bg-blue-500 text-white px-4 py-2 rounded">Close</button>
                </div>
            </div>
        </div>
    );
}